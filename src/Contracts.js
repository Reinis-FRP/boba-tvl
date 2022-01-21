const contracts = {
  ERC20: {
    abi: [
      {"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
    ]
  },
  L1StandardBridge: {
    address: "0xdc1664458d2f0B6090bEa60A8793A4E66c2F1c00",
    abi: [
      {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_l1Token","type":"address"},{"indexed":true,"internalType":"address","name":"_l2Token","type":"address"},{"indexed":true,"internalType":"address","name":"_from","type":"address"},{"indexed":false,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"_data","type":"bytes"}],"name":"ERC20DepositInitiated","type":"event"},
      {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_l1Token","type":"address"},{"indexed":true,"internalType":"address","name":"_l2Token","type":"address"},{"indexed":true,"internalType":"address","name":"_from","type":"address"},{"indexed":false,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"_data","type":"bytes"}],"name":"ERC20WithdrawalFinalized","type":"event"},
      {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_from","type":"address"},{"indexed":true,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"_data","type":"bytes"}],"name":"ETHDepositInitiated","type":"event"},
      {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_from","type":"address"},{"indexed":true,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"_data","type":"bytes"}],"name":"ETHWithdrawalFinalized","type":"event"},
    ],
  },
  L1LiquidityPool: {
    address: "0x1A26ef6575B7BBB864d984D9255C069F6c361a14",
    abi: [
      {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"receivedAmount","type":"uint256"},{"indexed":false,"internalType":"address","name":"tokenAddress","type":"address"}],"name":"ClientDepositL1","type":"event"},
      {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"userRewardFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ownerRewardFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"totalFee","type":"uint256"},{"indexed":false,"internalType":"address","name":"tokenAddress","type":"address"}],"name":"ClientPayL1","type":"event"},
      {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"userRewardFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ownerRewardFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"totalFee","type":"uint256"},{"indexed":false,"internalType":"address","name":"tokenAddress","type":"address"}],"name":"ClientPayL1Settlement","type":"event"},
    ],
  }
}

module.exports = { contracts };