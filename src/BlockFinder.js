const assert = require("assert");
const lodash = require("lodash");

class BlockFinder {
  constructor(requestBlock, blocks = []) {
    assert(requestBlock, "requestBlock function must be provided");
    this.requestBlock = requestBlock;
    this.blocks = blocks;
  }

  /**
   * @notice Gets the latest block whose timestamp is <= the provided timestamp.
   * @param {number} timestamp timestamp to search.
   */

  async getBlockForTimestamp(timestamp) {
    timestamp = Number(timestamp);
    assert(timestamp !== undefined && timestamp !== null, "timestamp must be provided");
    // If the last block we have stored is too early, grab the latest block.
    if (this.blocks.length === 0 || this.blocks[this.blocks.length - 1].timestamp < timestamp) {
      const block = await this.getLatestBlock();
      if (timestamp >= block.timestamp) return block;
    }

    // Check the first block. If it's grater than our timestamp, we need to find an earlier block.
    if (this.blocks[0].timestamp > timestamp) {
      const initialBlock = this.blocks[0];
      const cushion = 1.1;
      // Ensure the increment block distance is _at least_ a single block to prevent an infinite loop.
      const incrementDistance = Math.max(await this.estimateBlocksElapsed(initialBlock.timestamp - timestamp, cushion), 1);

      // Search backwards by a constant increment until we find a block before the timestamp or hit block 0.
      for (let multiplier = 1; ; multiplier++) {
        const distance = multiplier * incrementDistance;
        const blockNumber = Math.max(0, initialBlock.number - distance);
        const block = await this.getBlock(blockNumber);
        if (block.timestamp <= timestamp) break; // Found an earlier block.
        assert(blockNumber > 0, "timestamp is before block 0"); // Block 0 was not earlier than this timestamp. Throw.
      }
    }

    // Find the index where the block would be inserted and use that as the end block (since it is >= the timestamp).
    const index = lodash.sortedIndexBy(this.blocks, { timestamp }, "timestamp");
    return this.findBlock(this.blocks[index - 1], this.blocks[index], timestamp);
  }

  // Grabs the most recent block and caches it.
  async getLatestBlock() {
    const block = await this.requestBlock("latest");
    const index = lodash.sortedIndexBy(this.blocks, block, "number");
    if (!this.blocks[index] || this.blocks[index].number !== block.number) this.blocks.splice(index, 0, block);
    return this.blocks[index];
  }

  // Grabs the block for a particular number and caches it.
  async getBlock(number) {
    const index = lodash.sortedIndexBy(this.blocks, { number }, "number");
    if (this.blocks[index] && this.blocks[index].number === number) return this.blocks[index]; // Return early if block already exists.
    const block = await this.requestBlock(number);
    this.blocks.splice(index, 0, block); // A simple insert at index.
    return block;
  }

  // Return the latest block, between startBlock and endBlock, whose timestamp is <= timestamp.
  async findBlock(_startBlock, _endBlock, timestamp) {
    const [startBlock, endBlock] = [_startBlock, _endBlock];
    // In the case of equality, the endBlock is expected to be passed as the one whose timestamp === the requested
    // timestamp.
    if (endBlock.timestamp === timestamp) return endBlock;

    // If there's no equality, but the blocks are adjacent, return the startBlock, since we want the returned block's
    // timestamp to be <= the requested timestamp.
    if (endBlock.number === startBlock.number + 1) return startBlock;

    assert(endBlock.number !== startBlock.number, "startBlock cannot equal endBlock");
    assert(
      timestamp < endBlock.timestamp && timestamp > startBlock.timestamp,
      "timestamp not in between start and end blocks"
    );

    // Interpolating the timestamp we're searching for to block numbers.
    const totalTimeDifference = endBlock.timestamp - startBlock.timestamp;
    const totalBlockDistance = endBlock.number - startBlock.number;
    const blockPercentile = (timestamp - startBlock.timestamp) / totalTimeDifference;
    const estimatedBlock = startBlock.number + Math.round(blockPercentile * totalBlockDistance);

    // Clamp ensures the estimated block is strictly greater than the start block and strictly less than the end block.
    const newBlock = await this.getBlock(lodash.clamp(estimatedBlock, startBlock.number + 1, endBlock.number - 1));

    // Depending on whether the new block is below or above the timestamp, narrow the search space accordingly.
    if (newBlock.timestamp < timestamp) {
      return this.findBlock(newBlock, endBlock, timestamp);
    } else {
      return this.findBlock(startBlock, newBlock, timestamp);
    }
  }

  async estimateBlocksElapsed(seconds, cushionPercentage = 0.0) {
    const cushionMultiplier = cushionPercentage + 1.0;
    const averageBlockTime = await this.averageBlockTimeSeconds();
    return Math.floor((seconds * cushionMultiplier) / averageBlockTime);
  }

  async averageBlockTimeSeconds(lookbackSeconds, networkId) {
    // TODO: Call an external API to get this data. Currently this value is a hard-coded estimate
    // based on the data from https://etherscan.io/chart/blocktime. ~13.5 seconds has been the average
    // since April 2016, although this value seems to spike periodically for a relatively short period of time.
    const defaultBlockTimeSeconds = 13.5;
    if (!defaultBlockTimeSeconds) {
      throw "Missing default block time value";
    }

    switch (networkId) {
      // Source: https://polygonscan.com/chart/blocktime
      case 137:
        return 2.5;
      case 1:
        return defaultBlockTimeSeconds;
      default:
        return defaultBlockTimeSeconds;
    }
  }
}

module.exports = { BlockFinder };