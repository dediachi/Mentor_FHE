pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MentorFHE is ZamaEthereumConfig {
    struct MentorProfile {
        string encryptedSkills;         
        euint32 encryptedRequirements;  
        uint256 publicExperience;       
        uint256 publicAvailability;    
        string encryptedContact;       
        address creator;               
        uint256 timestamp;             
        uint32 decryptedMatchScore;    
        bool isMatched;                
    }

    struct MenteeProfile {
        string encryptedNeeds;          
        euint32 encryptedPreferences;   
        uint256 publicBudget;           
        uint256 publicTimeline;         
        string encryptedContact;       
        address creator;               
        uint256 timestamp;             
        uint32 decryptedMatchScore;    
        bool isMatched;                
    }

    mapping(string => MentorProfile) public mentorProfiles;
    mapping(string => MenteeProfile) public menteeProfiles;
    
    string[] public mentorIds;
    string[] public menteeIds;

    event MentorProfileCreated(string indexed mentorId, address indexed creator);
    event MenteeProfileCreated(string indexed menteeId, address indexed creator);
    event MatchVerified(string indexed mentorId, string indexed menteeId, uint32 matchScore);

    constructor() ZamaEthereumConfig() {
    }

    function createMentorProfile(
        string calldata mentorId,
        string calldata encryptedSkills,
        externalEuint32 encryptedRequirements,
        bytes calldata inputProof,
        uint256 publicExperience,
        uint256 publicAvailability,
        string calldata encryptedContact
    ) external {
        require(bytes(mentorProfiles[mentorId].encryptedSkills).length == 0, "Mentor profile already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedRequirements, inputProof)), "Invalid encrypted requirements");

        mentorProfiles[mentorId] = MentorProfile({
            encryptedSkills: encryptedSkills,
            encryptedRequirements: FHE.fromExternal(encryptedRequirements, inputProof),
            publicExperience: publicExperience,
            publicAvailability: publicAvailability,
            encryptedContact: encryptedContact,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedMatchScore: 0,
            isMatched: false
        });

        FHE.allowThis(mentorProfiles[mentorId].encryptedRequirements);
        FHE.makePubliclyDecryptable(mentorProfiles[mentorId].encryptedRequirements);

        mentorIds.push(mentorId);
        emit MentorProfileCreated(mentorId, msg.sender);
    }

    function createMenteeProfile(
        string calldata menteeId,
        string calldata encryptedNeeds,
        externalEuint32 encryptedPreferences,
        bytes calldata inputProof,
        uint256 publicBudget,
        uint256 publicTimeline,
        string calldata encryptedContact
    ) external {
        require(bytes(menteeProfiles[menteeId].encryptedNeeds).length == 0, "Mentee profile already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedPreferences, inputProof)), "Invalid encrypted preferences");

        menteeProfiles[menteeId] = MenteeProfile({
            encryptedNeeds: encryptedNeeds,
            encryptedPreferences: FHE.fromExternal(encryptedPreferences, inputProof),
            publicBudget: publicBudget,
            publicTimeline: publicTimeline,
            encryptedContact: encryptedContact,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedMatchScore: 0,
            isMatched: false
        });

        FHE.allowThis(menteeProfiles[menteeId].encryptedPreferences);
        FHE.makePubliclyDecryptable(menteeProfiles[menteeId].encryptedPreferences);

        menteeIds.push(menteeId);
        emit MenteeProfileCreated(menteeId, msg.sender);
    }

    function verifyMatch(
        string calldata mentorId,
        string calldata menteeId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(mentorProfiles[mentorId].encryptedSkills).length > 0, "Mentor profile does not exist");
        require(bytes(menteeProfiles[menteeId].encryptedNeeds).length > 0, "Mentee profile does not exist");
        require(!mentorProfiles[mentorId].isMatched, "Mentor already matched");
        require(!menteeProfiles[menteeId].isMatched, "Mentee already matched");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(mentorProfiles[mentorId].encryptedRequirements);
        cts[1] = FHE.toBytes32(menteeProfiles[menteeId].encryptedPreferences);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        require(decodedValue > 0, "Invalid match score");

        mentorProfiles[mentorId].decryptedMatchScore = decodedValue;
        menteeProfiles[menteeId].decryptedMatchScore = decodedValue;
        mentorProfiles[mentorId].isMatched = true;
        menteeProfiles[menteeId].isMatched = true;

        emit MatchVerified(mentorId, menteeId, decodedValue);
    }

    function getMentorProfile(string calldata mentorId) external view returns (
        string memory encryptedSkills,
        uint256 publicExperience,
        uint256 publicAvailability,
        string memory encryptedContact,
        address creator,
        uint256 timestamp,
        bool isMatched,
        uint32 decryptedMatchScore
    ) {
        require(bytes(mentorProfiles[mentorId].encryptedSkills).length > 0, "Mentor profile does not exist");
        MentorProfile storage profile = mentorProfiles[mentorId];
        
        return (
            profile.encryptedSkills,
            profile.publicExperience,
            profile.publicAvailability,
            profile.encryptedContact,
            profile.creator,
            profile.timestamp,
            profile.isMatched,
            profile.decryptedMatchScore
        );
    }

    function getMenteeProfile(string calldata menteeId) external view returns (
        string memory encryptedNeeds,
        uint256 publicBudget,
        uint256 publicTimeline,
        string memory encryptedContact,
        address creator,
        uint256 timestamp,
        bool isMatched,
        uint32 decryptedMatchScore
    ) {
        require(bytes(menteeProfiles[menteeId].encryptedNeeds).length > 0, "Mentee profile does not exist");
        MenteeProfile storage profile = menteeProfiles[menteeId];
        
        return (
            profile.encryptedNeeds,
            profile.publicBudget,
            profile.publicTimeline,
            profile.encryptedContact,
            profile.creator,
            profile.timestamp,
            profile.isMatched,
            profile.decryptedMatchScore
        );
    }

    function getAllMentorIds() external view returns (string[] memory) {
        return mentorIds;
    }

    function getAllMenteeIds() external view returns (string[] memory) {
        return menteeIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

