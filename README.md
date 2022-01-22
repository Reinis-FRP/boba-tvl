# Boba network TVL calculation script

## Installing

Install dependencies by running `yarn` from the root of the repo.

## Running

Provide Ethereum mainnet node RPC as `NODE_URL_CHAIN_1` environment variable.

Run the script with `node ./index.js` by providing following optional arguments:

- `--ccy` provides TVL denomination currency, defaults to usd. This should match `vs_currency` supported by CoinGecko.
- `--from` UNIX timestamp for the begining of TWAP calculation range.
- `--to` UNIX timestamp for the end of TWAP calculation range.