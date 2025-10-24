// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, ebool, euint32, euint64, externalEuint32, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { FestivalTicket } from "./FestivalTicket.sol";

/**
 * FestivalRegistry (simplified):
 * - Manages festivals, ticket classes, ticket NFT address registry
 * - Demonstrates FHE usage: encrypted check-in status and encrypted seat index per ticketId
 * - External encrypted inputs use FHE.fromExternal with proofs provided by relayer/mock
 */
contract FestivalRegistry is SepoliaConfig, Ownable {
  struct Festival {
    address organizer;
    string metadataURI; // IPFS CID
    uint64 startTime;
    uint64 endTime;
    string venue;
    bool exists;
  }

  // festivalId => Festival
  mapping(uint256 => Festival) private _festivals;

  // ticket NFT collection per festival (external ERC721, minted elsewhere or future module)
  mapping(uint256 => address) public ticketCollection;

  // Encrypted state per ticketId
  mapping(uint256 => euint32) private _checkInCipher; // 0 or 1
  mapping(uint256 => euint32) private _seatIndexCipher; // seat index (encrypted)

  event FestivalCreated(uint256 indexed festivalId, address indexed organizer, string metadataURI);
  event FestivalTicketDeployed(uint256 indexed festivalId, address ticket);
  event TicketMinted(uint256 indexed festivalId, uint256 indexed tokenId, address owner);
  event CheckInRecorded(uint256 indexed ticketId, uint256 indexed festivalId);
  event SeatAssigned(uint256 indexed ticketId, uint32 seatIndex);

  constructor(address initialOwner) Ownable(initialOwner) {}

  function createFestival(
    uint256 festivalId,
    string calldata metadataURI,
    address organizer,
    uint64 startTime,
    uint64 endTime,
    string calldata venue,
    bool deployTicket
  ) external onlyOwner {
    require(!_festivals[festivalId].exists, "festival exists");
    _festivals[festivalId] = Festival({
      organizer: organizer,
      metadataURI: metadataURI,
      startTime: startTime,
      endTime: endTime,
      venue: venue,
      exists: true
    });
    emit FestivalCreated(festivalId, organizer, metadataURI);

    if (deployTicket) {
      FestivalTicket t = new FestivalTicket(
        string.concat("Festival ", _toString(festivalId), " Ticket"),
        "CFST",
        address(this),
        owner()
      );
      ticketCollection[festivalId] = address(t);
      emit FestivalTicketDeployed(festivalId, address(t));
    }
  }

  function getFestival(uint256 festivalId) external view returns (Festival memory) {
    return _festivals[festivalId];
  }

  function buyTicket(uint256 festivalId) external returns (uint256 tokenId) {
    require(_festivals[festivalId].exists, "festival !exists");
    address coll = ticketCollection[festivalId];
    require(coll != address(0), "ticket not set");
    tokenId = FestivalTicket(coll).mintTo(msg.sender);
    emit TicketMinted(festivalId, tokenId, msg.sender);
  }

  function claimCheckIn(
    uint256 festivalId,
    uint256 ticketId,
    externalEuint32 encCheckedIn,
    bytes calldata inputProof
  ) external {
    require(_festivals[festivalId].exists, "festival !exists");

    address coll = ticketCollection[festivalId];
    if (coll != address(0)) {
      require(IERC721(coll).ownerOf(ticketId) == msg.sender, "not owner");
    }

    euint32 incoming = FHE.fromExternal(encCheckedIn, inputProof);

    euint32 prev = _checkInCipher[ticketId];
    euint32 sum = FHE.add(prev, incoming);
    euint32 one = FHE.asEuint32(1);
    euint32 clamped = FHE.min(sum, one);

    _checkInCipher[ticketId] = clamped;

    FHE.allowThis(_checkInCipher[ticketId]);
    FHE.allow(_checkInCipher[ticketId], msg.sender);

    emit CheckInRecorded(ticketId, festivalId);
  }

  function assignSeat(
    uint256 festivalId,
    uint256 ticketId,
    externalEuint32 encSeatIndex,
    bytes calldata inputProof
  ) external {
    require(_festivals[festivalId].exists, "festival !exists");
    require(msg.sender == _festivals[festivalId].organizer || msg.sender == owner(), "only org/owner");

    euint32 seat = FHE.fromExternal(encSeatIndex, inputProof);
    _seatIndexCipher[ticketId] = seat;

    FHE.allowThis(_seatIndexCipher[ticketId]);
    FHE.allow(_seatIndexCipher[ticketId], _festivals[festivalId].organizer);

    // Also allow the current ticket owner to decrypt the seat index
    address coll = ticketCollection[festivalId];
    if (coll != address(0)) {
      address currentOwner = IERC721(coll).ownerOf(ticketId);
      FHE.allow(_seatIndexCipher[ticketId], currentOwner);
    }

    emit SeatAssigned(ticketId, 0);
  }

  function getCheckInHandle(uint256 ticketId) external view returns (euint32) {
    return _checkInCipher[ticketId];
  }

  function getSeatIndexHandle(uint256 ticketId) external view returns (euint32) {
    return _seatIndexCipher[ticketId];
  }

  function _toString(uint256 value) internal pure returns (string memory) {
    if (value == 0) {
      return "0";
    }
    uint256 temp = value;
    uint256 digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }
}
