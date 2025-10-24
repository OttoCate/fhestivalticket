// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract FestivalTicket is ERC721, Ownable {
  address public registry;
  uint256 private _nextId = 1;

  modifier onlyRegistry() {
    require(msg.sender == registry, "only registry");
    _;
  }

  constructor(string memory name_, string memory symbol_, address registry_, address initialOwner) ERC721(name_, symbol_) Ownable(initialOwner) {
    registry = registry_;
  }

  function mintTo(address to) external onlyRegistry returns (uint256 tokenId) {
    tokenId = _nextId++;
    _mint(to, tokenId);
  }

  function totalSupply() external view returns (uint256) {
    // _nextId starts at 1 and increments after mint
    return _nextId - 1;
  }
}
