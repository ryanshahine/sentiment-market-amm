// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * TWO-SIDED SENTIMENT AMM — FINAL FIXED VERSION
 *
 * - ETH-based long and short
 * - longReserve + shortReserve determine sentiment
 * - price = longReserve / (longReserve + shortReserve)
 * - avg entry tracked on-chain (no arrays)
 * - slippage-aware exit using midpoint approximation
 * - realized PnL is signed (int256)
 */

contract SentimentAMM {
    uint256 public constant SCALE = 1e18;

    // -------------------------------------------------------------------------
    // AMM STATE
    // -------------------------------------------------------------------------

    uint256 public longReserve;
    uint256 public shortReserve;

    mapping(address => uint256) public longExposure;
    mapping(address => uint256) public shortExposure;

    mapping(address => uint256) public avgLongEntry;   // scaled 1e18
    mapping(address => uint256) public avgShortEntry;  // scaled 1e18

    // Volumes for UI analytics
    uint256 public totalLongVolume;
    uint256 public totalShortVolume;
    uint256 public totalCloseLongVolume;
    uint256 public totalCloseShortVolume;

    // -------------------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------------------

    event LongOpened(address indexed user, uint256 amount, uint256 newReserve, uint256 price);
    event ShortOpened(address indexed user, uint256 amount, uint256 newReserve, uint256 price);

    event LongClosed(
        address indexed user,
        uint256 amount,
        int256 realizedPnl,
        uint256 avgExitPrice,
        uint256 newReserve,
        uint256 price
    );

    event ShortClosed(
        address indexed user,
        uint256 amount,
        int256 realizedPnl,
        uint256 avgExitPrice,
        uint256 newReserve,
        uint256 price
    );

    event PriceUpdate(uint256 price, uint256 longReserve, uint256 shortReserve, uint256 timestamp);
    event ExposureUpdate(address indexed user, uint256 longExposure, uint256 shortExposure);

    // -------------------------------------------------------------------------
    // PRICE FUNCTION
    // -------------------------------------------------------------------------

    function price() public view returns (uint256) {
        uint256 lr = longReserve;
        uint256 sr = shortReserve;
        if (lr + sr == 0) return SCALE / 2;
        return (lr * SCALE) / (lr + sr);
    }

    // -------------------------------------------------------------------------
    // PREVIEW OPEN
    // -------------------------------------------------------------------------

    function previewLongOpen(uint256 amount) public view returns (uint256 newPrice) {
        uint256 newLR = longReserve + amount;
        return (newLR * SCALE) / (newLR + shortReserve);
    }

    function previewShortOpen(uint256 amount) public view returns (uint256 newPrice) {
        uint256 newSR = shortReserve + amount;
        return (longReserve * SCALE) / (longReserve + newSR);
    }

    // -------------------------------------------------------------------------
    // INTERNAL: SLIPPAGE EXIT SIMULATION (midpoint rule)
    // -------------------------------------------------------------------------

    function _simulateExit(
        uint256 startReserve,
        uint256 endReserve,
        uint256 counterReserve
    ) internal pure returns (uint256 avgPrice) {
        uint256 pStart = (startReserve * SCALE) / (startReserve + counterReserve);
        uint256 pEnd   = (endReserve   * SCALE) / (endReserve   + counterReserve);
        return (pStart + pEnd) / 2;
    }

    // -------------------------------------------------------------------------
    // PREVIEW CLOSE
    // -------------------------------------------------------------------------

    function previewLongClose(uint256 amount)
        public
        view
        returns (uint256 ethOut, uint256 avgExitPrice)
    {
        require(amount <= longExposure[msg.sender], "Not enough long");

        uint256 newLR = longReserve - amount;
        avgExitPrice = _simulateExit(longReserve, newLR, shortReserve);

        return (amount, avgExitPrice);
    }

    function previewShortClose(uint256 amount)
        public
        view
        returns (uint256 ethOut, uint256 avgExitPrice)
    {
        require(amount <= shortExposure[msg.sender], "Not enough short");

        uint256 newSR = shortReserve - amount;
        avgExitPrice = _simulateExit(shortReserve, newSR, longReserve);

        return (amount, avgExitPrice);
    }

    // -------------------------------------------------------------------------
    // OPEN LONG
    // -------------------------------------------------------------------------

    function goLong() external payable {
        uint256 amount = msg.value;
        require(amount > 0, "Send ETH");

        uint256 oldExp = longExposure[msg.sender];
        uint256 newExp = oldExp + amount;

        uint256 currentPrice = price();

        if (oldExp == 0) {
            avgLongEntry[msg.sender] = currentPrice;
        } else {
            avgLongEntry[msg.sender] =
                (oldExp * avgLongEntry[msg.sender] + amount * currentPrice) / newExp;
        }

        longExposure[msg.sender] = newExp;
        totalLongVolume += amount;

        longReserve += amount;

        uint256 p = price();

        emit LongOpened(msg.sender, amount, longReserve, p);
        emit ExposureUpdate(msg.sender, longExposure[msg.sender], shortExposure[msg.sender]);
        emit PriceUpdate(p, longReserve, shortReserve, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // OPEN SHORT
    // -------------------------------------------------------------------------

    function goShort() external payable {
        uint256 amount = msg.value;
        require(amount > 0, "Send ETH");

        uint256 oldExp = shortExposure[msg.sender];
        uint256 newExp = oldExp + amount;

        uint256 currentPrice = price();

        if (oldExp == 0) {
            avgShortEntry[msg.sender] = currentPrice;
        } else {
            avgShortEntry[msg.sender] =
                (oldExp * avgShortEntry[msg.sender] + amount * currentPrice) / newExp;
        }

        shortExposure[msg.sender] = newExp;
        totalShortVolume += amount;

        shortReserve += amount;

        uint256 p = price();

        emit ShortOpened(msg.sender, amount, shortReserve, p);
        emit ExposureUpdate(msg.sender, longExposure[msg.sender], shortExposure[msg.sender]);
        emit PriceUpdate(p, longReserve, shortReserve, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // CLOSE LONG (slippage-aware)
    // -------------------------------------------------------------------------

    function closeLong(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        require(amount <= longExposure[msg.sender], "Not enough long");
        require(amount <= longReserve, "Reserve too small");

        longExposure[msg.sender] -= amount;
        totalCloseLongVolume += amount;

        uint256 newLR   = longReserve - amount;
        uint256 exitPx  = _simulateExit(longReserve, newLR, shortReserve);
        longReserve     = newLR;

        // PnL calc (signed)
        int256 realizedPnl =
            (int256(amount) * int256(exitPx - avgLongEntry[msg.sender])) / int256(SCALE);

        // Real payout: the AMM simply returns amount ETH (PnL shown off-chain)
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH failed");

        uint256 p = price();

        emit LongClosed(msg.sender, amount, realizedPnl, exitPx, longReserve, p);
        emit ExposureUpdate(msg.sender, longExposure[msg.sender], shortExposure[msg.sender]);
        emit PriceUpdate(p, longReserve, shortReserve, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // CLOSE SHORT (slippage-aware)
    // -------------------------------------------------------------------------

    function closeShort(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        require(amount <= shortExposure[msg.sender], "Not enough short");
        require(amount <= shortReserve, "Reserve too small");

        shortExposure[msg.sender] -= amount;
        totalCloseShortVolume += amount;

        uint256 newSR   = shortReserve - amount;
        uint256 exitPx  = _simulateExit(shortReserve, newSR, longReserve);
        shortReserve    = newSR;

        // PnL calc (signed, reversed for short)
        int256 realizedPnl =
            (int256(amount) * int256(avgShortEntry[msg.sender] - exitPx)) / int256(SCALE);

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH failed");

        uint256 p = price();

        emit ShortClosed(msg.sender, amount, realizedPnl, exitPx, shortReserve, p);
        emit ExposureUpdate(msg.sender, longExposure[msg.sender], shortExposure[msg.sender]);
        emit PriceUpdate(p, longReserve, shortReserve, block.timestamp);
    }
}
