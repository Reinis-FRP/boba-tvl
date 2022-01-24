#!/usr/bin/env node

require("dotenv").config();
const Web3 = require('web3');
const fetch = require('node-fetch');
const lodash=require('lodash');
const moment = require('moment');
const {BlockFinder} = require('./src/BlockFinder');
const {contracts} = require('./src/Contracts');
const web3 = new Web3(process.env.NODE_URL_CHAIN_1);
const { fromWei, toBN, toWei } = web3.utils;

const earliestBlock = 13012048;  // No need to look for events before L1StandardBridge was deployed.

const argv = require("minimist")(process.argv.slice(), {
  string: [
    "ccy",
  ],
  number: [
    "from",
    "to",
    "interval",
  ]
});

// Dynamically adjust block range requested. Start requesting full range,
// reduce number of blocks by half if request failed.
// Double next request range if the the previous one succeeded.
async function getRateLimitedEvents(contract, eventName, fromBlock, toBlock) {
  let events = [];
  let lastBlock = fromBlock - 1;
  let blockRange = toBlock - lastBlock;
  while (true) {
    try {
      events = events.concat(await contract.getPastEvents(eventName, {
        fromBlock: lastBlock + 1,
        toBlock: Math.min(lastBlock + blockRange, toBlock)
      }));
    } catch (err) {
      blockRange = Math.max(parseInt(blockRange / 2), 1);
      continue;
    }
    if (lastBlock + 1 + blockRange < toBlock) {
      lastBlock += blockRange;
      blockRange *= 2;
    } else {
      break;
    }
  }
  return events;
}

async function getEthDepositInitiated(contract, toBlock) {
  return (await getRateLimitedEvents(contract, "ETHDepositInitiated", earliestBlock, toBlock)).map((event) => {
    return {
      token: "0x0000000000000000000000000000000000000000",
      netAmount: toBN(event.returnValues._amount),
      blockNumber: event.blockNumber,
    };
  });
}

async function getErc20DepositInitiated(contract, toBlock) {
  return (await getRateLimitedEvents(contract, "ERC20DepositInitiated", earliestBlock, toBlock)).map((event) => {
    return {
      token: event.returnValues._l1Token,
      netAmount: toBN(event.returnValues._amount),
      blockNumber: event.blockNumber,
    };
  });
}

async function getEthWithdrawalFinalized(contract, toBlock) {
  return (await getRateLimitedEvents(contract, "ETHWithdrawalFinalized", earliestBlock, toBlock)).map((event) => {
    return {
      token: "0x0000000000000000000000000000000000000000",
      netAmount: toBN(event.returnValues._amount).neg(),
      blockNumber: event.blockNumber,
    };
  });
}

async function getErc20WithdrawalFinalized(contract, toBlock) {
  return (await getRateLimitedEvents(contract, "ERC20WithdrawalFinalized", earliestBlock, toBlock)).map((event) => {
    return {
      token: event.returnValues._l1Token,
      netAmount: toBN(event.returnValues._amount).neg(),
      blockNumber: event.blockNumber,
    };
  });
}

// Get token decimals.
async function getTokenDecimals(tokenAddress) {
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return 18;
  }
  const tokenContract = new web3.eth.Contract(contracts.ERC20.abi, tokenAddress);
  const tokenDecimals = await tokenContract.methods.decimals().call();
  return tokenDecimals;
}

// Fetch CoinGecko price from token address.
async function getCoingeckoPrices(platform, address, ccy, from, to) {
  let url;
  // If the script throws due to missing contract endpoint then need to add CoinGecko API ID manually below.
  if (address == "0x0000000000000000000000000000000000000000") {
    url = 'https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=' +
      ccy + '&from=' + from + '&to=' + to;
  } else if (address == "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD") {
    url = 'https://api.coingecko.com/api/v3/coins/terrausd/market_chart/range?vs_currency=' +
      ccy + '&from=' + from + '&to=' + to;
  } else if (address == "0xB8c77482e45F1F44dE1745F52C74426C631bDD52") {
    url = 'https://api.coingecko.com/api/v3/coins/binancecoin/market_chart/range?vs_currency='
      + ccy + '&from=' + from + '&to=' + to;
  } else {
    url = 'https://api.coingecko.com/api/v3/coins/' + platform + '/contract/' + address +
    '/market_chart/range?vs_currency=' + ccy + '&from=' + from + '&to=' + to;
  }
  const response = await fetch(url);
  if (response.status != 200) throw "failed to fetch CoinGecko prices for " + url;
  const json = await response.json();
  return json.prices;
}

// Get the last available price for particular timestamp.
function getCoingeckoPriceAt(tokenPrices, tokenAddress, timestamp) {
  const nextPriceIndex = tokenPrices[tokenAddress].findIndex((timestampPrice) => {
    return timestampPrice[0] / 1000 > timestamp;
  });
  if (nextPriceIndex == -1) {
    // Requested timestamp is after available price range hence return last available price.
    return tokenPrices[tokenAddress].slice(-1)[0][1];
  } else if (nextPriceIndex == 0) {
    // Requested timestamp is before available price range, hence not available.
    throw "No price available for " + tokenAddress + " at " + timestamp;
  } else {
    return tokenPrices[tokenAddress][nextPriceIndex - 1][1];
  }
}

// Add starting balances for the interval.
function addFirstBalance(tokenBalances, startTimestamp) {
  const firstBalanceIndex = tokenBalances.findIndex((balanceItem) => {
    return balanceItem.timestamp > startTimestamp;
  });
  let firstBalanceItem = {timestamp: startTimestamp};
  if (firstBalanceIndex == -1) {
    firstBalanceItem = {...tokenBalances.slice(-1)[0], ...firstBalanceItem};
    tokenBalances.push(firstBalanceItem);
  } else if (firstBalanceIndex == 0) {
    firstBalanceItem = {...{tokenBalance: 0, value: 0}, ...firstBalanceItem};
    tokenBalances.splice(firstBalanceIndex, 0, firstBalanceItem);
  } else {
    firstBalanceItem = {...tokenBalances[firstBalanceIndex - 1], ...firstBalanceItem};
    tokenBalances.splice(firstBalanceIndex, 0, firstBalanceItem);
  }
}

// Calculate TWAP from token balances for the time range.
function calculateTwap(tokenBalances, startTimestamp, endTimestamp) {
  let cumValue = 0;
  const selectedBalances = tokenBalances.filter((balanceItem) => {
    return balanceItem.timestamp && balanceItem.timestamp >= startTimestamp && balanceItem.timestamp < endTimestamp;
  });
  selectedBalances.forEach((balanceItem, balanceIndex) => {
    // Weight value by time difference till next value,
    // except for last entry weight by time till end of evaluation timestamp.
    const timePeriod = (balanceIndex < selectedBalances.length - 1) ?
      selectedBalances[balanceIndex + 1].timestamp - balanceItem.timestamp :
      endTimestamp - balanceItem.timestamp;
    cumValue += selectedBalances[balanceIndex].value * timePeriod;
  });
  return cumValue / (endTimestamp - startTimestamp);
}

async function main() {
  // If user did not specify TVL measurement an identifier default to usd.
  const tvlCurrency = argv.ccy ? argv.ccy : "usd";

  // If user did not specify time range default till current time and from previous 24h.
  const toTimestamp = argv.to ? argv.to : Math.round(new Date().getTime() / 1000);
  const fromTimestamp = argv.from ? argv.from : toTimestamp - 86400;

  if (fromTimestamp > toTimestamp) throw "--from timestamp cannot be higher than --to timestamp";

  // If user did not specify interval default to 1h for less than 24h range and 1d for larger range.
  const interval = argv.interval ? argv.interval :
    (toTimestamp - fromTimestamp > 86400 ? 86400 : 3600);

  // Determine start and end block numbers for the evaluation range.
  const blockFinder = new BlockFinder(web3.eth.getBlock);
  const fromBlock = (await blockFinder.getBlockForTimestamp(fromTimestamp)).number;
  const toBlock = (await blockFinder.getBlockForTimestamp(toTimestamp)).number;
  if (toBlock < earliestBlock) throw "--to timestamp cannot be earlier than L1StandardBridge deployment";

  // Get all bridging events from Boba gateway on L1.
  const l1StandardBridge = new web3.eth.Contract(contracts.L1StandardBridge.abi, contracts.L1StandardBridge.address);
  const rawBridgeTransactions = (await Promise.all([
    getEthDepositInitiated(l1StandardBridge, toBlock),
    getErc20DepositInitiated(l1StandardBridge, toBlock),
    getEthWithdrawalFinalized(l1StandardBridge, toBlock),
    getErc20WithdrawalFinalized(l1StandardBridge, toBlock),
  ])).flat();
  const sortedBridgeTransactions = lodash.sortBy(rawBridgeTransactions, ["blockNumber"]);

  // Calculate balances for each token at each available block number.
  const balances = {};
  sortedBridgeTransactions.forEach((transaction) => {
    if (balances[transaction.token]) {
      balances[transaction.token].push({
        blockNumber: transaction.blockNumber,
        rawBalance: balances[transaction.token].slice(-1)[0].rawBalance.add(transaction.netAmount)
      });
    } else {
      balances[transaction.token] = [{blockNumber: transaction.blockNumber, rawBalance: transaction.netAmount}];
    }
  });

  // Add timestamps to asset balances within requested range. Also calculate scaled down balances from token decimals.
  for (const tokenAddress in balances) {
    const tokenDecimals = await getTokenDecimals(tokenAddress);
    for (balanceItem of balances[tokenAddress]) {
      balanceItem.tokenBalance = fromWei(balanceItem.rawBalance.
        mul(toBN(toWei("1"))).
        div(toBN("10").
        pow(toBN(tokenDecimals))));
      if (balanceItem.blockNumber >= fromBlock) {
        balanceItem.timestamp = (await blockFinder.getBlock(balanceItem.blockNumber)).timestamp;
      }
    }
  }

  // Add balances exactly at start timestamp.
  for (const tokenAddress in balances) {
    addFirstBalance(balances[tokenAddress], fromTimestamp);
  }

  // Get token prices.
  const tokenPrices = {};
  await Promise.all(Object.keys(balances).map(async (tokenAddress) => {
    // Request prices for at least 30 day range in order to get hourly granularity.
    // If the period is too short CoinGecko might return more granular data, but it is not consistent
    // as it could become unavailable when script is run later.
    // Also make sure to request at least 1 day before start period so that first balance price is always available
    tokenPrices[tokenAddress] = await getCoingeckoPrices(
      "ethereum",
      tokenAddress,
      tvlCurrency,
      Math.min(fromTimestamp - 3600 * 24, toTimestamp - 3600 * 24 * 30),
      toTimestamp
    );
  }));

  // Calculate TVL based on CoinGecko for each timestamp when asset balance has changed within requested range.
  for (const tokenAddress in balances) {
    for (balanceItem of balances[tokenAddress]) {
      balanceItem.price = getCoingeckoPriceAt(tokenPrices, tokenAddress, balanceItem.timestamp);
      balanceItem.value = balanceItem.tokenBalance * balanceItem.price;
    }
  }

  // Update asset values whenever price changes within requested range.
  for (const tokenAddress in tokenPrices) {
    for (timestampPrice of tokenPrices[tokenAddress]) {
      if (timestampPrice[0] / 1000 > fromTimestamp && timestampPrice[0] / 1000 < toTimestamp) {
        const previousBalanceIndex = balances[tokenAddress].length - 1 - balances[tokenAddress].
          slice().reverse().findIndex((balanceItem) => {
          return balanceItem.timestamp < timestampPrice[0] / 1000;
        });
        const updatedValue = {
          timestamp: timestampPrice[0] / 1000,
          tokenBalance: balances[tokenAddress][previousBalanceIndex].tokenBalance,
          price: timestampPrice[1],
          value: balances[tokenAddress][previousBalanceIndex].tokenBalance * timestampPrice[1],
        };
        balances[tokenAddress].splice(previousBalanceIndex + 1, 0, updatedValue);
      }
    }
  }

  // Aggregate TVL and update it whenever value of any asset changes.
  const combinedBalances = [];
  for (const tokenAddress in balances) {
    balances[tokenAddress].forEach((balanceItem, balanceIndex) => {
      if (!balanceItem.timestamp || balanceItem.timestamp < fromTimestamp) return;
      const previousValue = (balanceIndex > 0 && balances[tokenAddress][balanceIndex - 1].timestamp >= fromTimestamp) ?
        balances[tokenAddress][balanceIndex - 1].value : 0;
      combinedBalances.push({
        tokenAddress: tokenAddress,
        timestamp: balanceItem.timestamp,
        value: balanceItem.value,
        previousValue: previousValue
      });
    });
  }
  const sortedBalances = lodash.sortBy(combinedBalances, ["timestamp"]);
  balances["Total"] = [];
  sortedBalances.forEach((balanceItem) => {
    if (balances["Total"].length == 0) {
      // For the first entry just copy balance from the first asset.
      balances["Total"].push({timestamp: balanceItem.timestamp, value: balanceItem.value});
    } else if (balances["Total"].slice(-1)[0].timestamp < balanceItem.timestamp) {
      // If the timestamp is changed then use previous aggregate balance and add delta for particular asset.
      balances["Total"].push({
        timestamp: balanceItem.timestamp,
        value: balances["Total"].slice(-1)[0].value + balanceItem.value - balanceItem.previousValue});
    } else {
      // Timestamp is the same hence adding particular asset value delta to the current total value entry.
      balances["Total"][balances["Total"].length - 1].value += balanceItem.value - balanceItem.previousValue;
    }
  });

  // Calculate TWAP for each asset, including for aggregate.
  const twaps = {};
  for (const tokenAddress in balances) {
    twaps[tokenAddress] = {};
    for (startTimestamp = fromTimestamp; startTimestamp < toTimestamp; startTimestamp += interval) {
      addFirstBalance(balances[tokenAddress], startTimestamp);
      twaps[tokenAddress][startTimestamp] = calculateTwap(balances[tokenAddress], startTimestamp, startTimestamp + interval);
    }
    twaps[tokenAddress]["All"] = calculateTwap(balances[tokenAddress], fromTimestamp, toTimestamp);
  }

  // Output time series TVL as CSV for charting.
  console.log("Timestamp", "TVL_" + tvlCurrency);
  balances["Total"].forEach((balanceItem) => {
    console.log(balanceItem.timestamp, balanceItem.value);
  });

  // Output TWAP for intervals as CSV for charting.
  console.log("\nintervalStart", "TVL_" + tvlCurrency);
  Object.keys(twaps["Total"]).forEach((intervalStart) => {
    if (intervalStart != "All") {
      console.log(intervalStart, twaps["Total"][intervalStart]);
    }
  });

  // Output resulting TWAP.
  console.log("\nTWAP for period from " +
    moment.unix(fromTimestamp).format("DD-MM-YYYY HH:mm:ss") +
    " to " +
    moment.unix(toTimestamp).format("DD-MM-YYYY HH:mm:ss") +
    " UTC: " +
    twaps["Total"]["All"] +
    " " +
    tvlCurrency);

}

main().then(
  () => {
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);