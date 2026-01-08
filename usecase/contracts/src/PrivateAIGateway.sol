// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrivateAIGateway
 * @notice Main contract for the PrivateAI Gateway - Decentralized Private AI Oracle
 * @dev Manages AI requests, payments, and result verification
 */
contract PrivateAIGateway is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct AIRequest {
        address requester;
        string provider;           // "openai", "anthropic", "mistral"
        bytes32 promptHash;        // Hash of the encrypted prompt
        bytes32 sessionKeyHash;    // Hash of the session key
        uint256 fee;              // Fee paid for the request
        uint256 timestamp;
        RequestStatus status;
        bytes32 resultHash;        // Hash of the result (for verification)
        string resultLocation;     // IPFS location of the encrypted result
    }
    
    enum RequestStatus {
        Pending,
        Processing,
        Completed,
        Failed,
        Refunded
    }
    
    struct Provider {
        string name;
        uint256 baseFee;          // Base fee in wei
        bool isActive;
        uint256 totalRequests;
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => AIRequest) public requests;
    mapping(string => Provider) public providers;
    mapping(address => bytes32[]) public userRequests;
    
    bytes32[] public allRequestIds;
    
    address public treasury;
    address public operator;      // Backend operator address
    
    uint256 public totalRequests;
    uint256 public totalFees;
    
    uint256 public constant MIN_FEE = 0.0001 ether;
    uint256 public platformFeePercent = 10; // 10%
    
    // ============ Events ============
    
    event RequestCreated(
        bytes32 indexed requestId,
        address indexed requester,
        string provider,
        bytes32 promptHash,
        uint256 fee,
        uint256 timestamp
    );
    
    event RequestProcessing(
        bytes32 indexed requestId,
        string iexecDealId
    );
    
    event RequestCompleted(
        bytes32 indexed requestId,
        bytes32 resultHash,
        string resultLocation
    );
    
    event RequestFailed(
        bytes32 indexed requestId,
        string reason
    );
    
    event RequestRefunded(
        bytes32 indexed requestId,
        uint256 amount
    );
    
    event ProviderUpdated(
        string provider,
        uint256 baseFee,
        bool isActive
    );
    
    // ============ Modifiers ============
    
    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner(), "Not operator");
        _;
    }
    
    modifier validProvider(string memory provider) {
        require(providers[provider].isActive, "Provider not active");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _treasury, address _operator) Ownable(msg.sender) {
        treasury = _treasury;
        operator = _operator;
        
        // Initialize default providers
        providers["openai"] = Provider("OpenAI GPT-4", 0.001 ether, true, 0);
        providers["anthropic"] = Provider("Anthropic Claude", 0.001 ether, true, 0);
        providers["mistral"] = Provider("Mistral AI", 0.0005 ether, true, 0);
    }
    
    // ============ User Functions ============
    
    /**
     * @notice Create a new AI request
     * @param provider AI provider (openai, anthropic, mistral)
     * @param promptHash Hash of the encrypted prompt
     * @param sessionKeyHash Hash of the session key for result decryption
     */
    function createRequest(
        string calldata provider,
        bytes32 promptHash,
        bytes32 sessionKeyHash
    ) external payable validProvider(provider) nonReentrant returns (bytes32) {
        require(msg.value >= providers[provider].baseFee, "Insufficient fee");
        require(promptHash != bytes32(0), "Invalid prompt hash");
        
        // Generate unique request ID
        bytes32 requestId = keccak256(abi.encodePacked(
            msg.sender,
            promptHash,
            block.timestamp,
            totalRequests
        ));
        
        // Create request
        requests[requestId] = AIRequest({
            requester: msg.sender,
            provider: provider,
            promptHash: promptHash,
            sessionKeyHash: sessionKeyHash,
            fee: msg.value,
            timestamp: block.timestamp,
            status: RequestStatus.Pending,
            resultHash: bytes32(0),
            resultLocation: ""
        });
        
        // Update state
        userRequests[msg.sender].push(requestId);
        allRequestIds.push(requestId);
        totalRequests++;
        totalFees += msg.value;
        providers[provider].totalRequests++;
        
        emit RequestCreated(
            requestId,
            msg.sender,
            provider,
            promptHash,
            msg.value,
            block.timestamp
        );
        
        return requestId;
    }
    
    /**
     * @notice Get user's request history
     */
    function getUserRequests(address user) external view returns (bytes32[] memory) {
        return userRequests[user];
    }
    
    /**
     * @notice Get request details
     */
    function getRequest(bytes32 requestId) external view returns (AIRequest memory) {
        return requests[requestId];
    }
    
    // ============ Operator Functions ============
    
    /**
     * @notice Mark request as processing (called when iExec deal is created)
     */
    function markProcessing(bytes32 requestId, string calldata iexecDealId) external onlyOperator {
        require(requests[requestId].status == RequestStatus.Pending, "Not pending");
        requests[requestId].status = RequestStatus.Processing;
        
        emit RequestProcessing(requestId, iexecDealId);
    }
    
    /**
     * @notice Complete a request with result
     */
    function completeRequest(
        bytes32 requestId,
        bytes32 resultHash,
        string calldata resultLocation
    ) external onlyOperator {
        AIRequest storage request = requests[requestId];
        require(request.status == RequestStatus.Processing, "Not processing");
        
        request.status = RequestStatus.Completed;
        request.resultHash = resultHash;
        request.resultLocation = resultLocation;
        
        // Transfer fee to treasury (minus platform fee)
        uint256 platformFee = (request.fee * platformFeePercent) / 100;
        uint256 operatorFee = request.fee - platformFee;
        
        payable(treasury).transfer(platformFee);
        payable(operator).transfer(operatorFee);
        
        emit RequestCompleted(requestId, resultHash, resultLocation);
    }
    
    /**
     * @notice Mark request as failed and refund
     */
    function failRequest(bytes32 requestId, string calldata reason) external onlyOperator {
        AIRequest storage request = requests[requestId];
        require(
            request.status == RequestStatus.Pending || 
            request.status == RequestStatus.Processing,
            "Cannot fail"
        );
        
        request.status = RequestStatus.Failed;
        
        // Refund the requester
        payable(request.requester).transfer(request.fee);
        
        emit RequestFailed(requestId, reason);
        emit RequestRefunded(requestId, request.fee);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update provider configuration
     */
    function updateProvider(
        string calldata provider,
        string calldata name,
        uint256 baseFee,
        bool isActive
    ) external onlyOwner {
        providers[provider] = Provider(name, baseFee, isActive, providers[provider].totalRequests);
        emit ProviderUpdated(provider, baseFee, isActive);
    }
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
    }
    
    /**
     * @notice Update operator address
     */
    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid address");
        operator = _operator;
    }
    
    /**
     * @notice Update platform fee percentage
     */
    function setPlatformFee(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 50, "Fee too high");
        platformFeePercent = _feePercent;
    }
    
    /**
     * @notice Emergency withdraw (only if stuck funds)
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get total number of requests
     */
    function getTotalRequests() external view returns (uint256) {
        return totalRequests;
    }
    
    /**
     * @notice Get provider stats
     */
    function getProviderStats(string calldata provider) external view returns (
        string memory name,
        uint256 baseFee,
        bool isActive,
        uint256 requestCount
    ) {
        Provider memory p = providers[provider];
        return (p.name, p.baseFee, p.isActive, p.totalRequests);
    }
    
    /**
     * @notice Check if a request exists
     */
    function requestExists(bytes32 requestId) external view returns (bool) {
        return requests[requestId].timestamp > 0;
    }
}
