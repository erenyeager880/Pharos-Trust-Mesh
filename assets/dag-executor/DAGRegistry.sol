// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DAGRegistry — on-chain execution evidence and multi-agent signoff for agent workflows
contract DAGRegistry {
    struct ExecutionRecord {
        bytes32 dagHash;
        bytes32 resultHash;
        address submitter;
        uint256 startBlock;
        uint256 endBlock;
        uint16 totalLayers;
        uint16 completedLayers;
        bool completed;
        bool failed;
    }

    uint16 public immutable requiredApprovals;

    mapping(address => uint256) public nonces;
    mapping(address => uint256) public verificationScore;
    mapping(bytes32 => ExecutionRecord) public executions;
    mapping(bytes32 => mapping(uint16 => bytes32)) public layerHashes;
    mapping(bytes32 => mapping(address => bool)) public hasApproved;
    mapping(bytes32 => string) public canonicalDagNames;

    mapping(bytes32 => address[]) private _approvers;

    event ExecutionRegistered(
        bytes32 indexed executionId,
        bytes32 indexed dagHash,
        address indexed submitter,
        uint16 totalLayers
    );
    event LayerCompleted(bytes32 indexed executionId, uint16 layerIndex, bytes32 layerHash);
    event ExecutionApproved(bytes32 indexed executionId, address indexed approver);
    event ExecutionFinalized(bytes32 indexed executionId, bytes32 resultHash);
    event ExecutionFailed(bytes32 indexed executionId);
    event CanonicalDagPublished(bytes32 indexed dagHash, string name);

    constructor(uint16 _requiredApprovals) {
        requiredApprovals = _requiredApprovals;
    }

    function registerExecution(bytes32 dagHash, uint16 totalLayers) external returns (bytes32 executionId) {
        require(totalLayers > 0, "Zero layers");
        executionId = keccak256(abi.encodePacked(dagHash, msg.sender, nonces[msg.sender]++));
        require(executions[executionId].submitter == address(0), "Execution exists");

        executions[executionId] = ExecutionRecord({
            dagHash: dagHash,
            resultHash: bytes32(0),
            submitter: msg.sender,
            startBlock: block.number,
            endBlock: 0,
            totalLayers: totalLayers,
            completedLayers: 0,
            completed: false,
            failed: false
        });

        emit ExecutionRegistered(executionId, dagHash, msg.sender, totalLayers);
    }

    function completeLayer(bytes32 executionId, uint16 layerIndex, bytes32 layerHash) external {
        ExecutionRecord storage rec = executions[executionId];
        require(rec.submitter != address(0), "Execution not found");
        require(msg.sender == rec.submitter, "Not submitter");
        require(!rec.completed, "Already completed");
        require(!rec.failed, "Execution failed");
        require(layerHash != bytes32(0), "Zero layer hash");
        require(layerIndex == rec.completedLayers, "Layer out of order");

        layerHashes[executionId][layerIndex] = layerHash;
        rec.completedLayers++;

        emit LayerCompleted(executionId, layerIndex, layerHash);
    }

    function approveExecution(bytes32 executionId) external {
        ExecutionRecord storage rec = executions[executionId];
        require(rec.submitter != address(0), "Execution not found");
        require(!rec.completed, "Already completed");
        require(!rec.failed, "Cannot approve failed");
        require(!hasApproved[executionId][msg.sender], "Already approved");

        hasApproved[executionId][msg.sender] = true;
        _approvers[executionId].push(msg.sender);
        verificationScore[msg.sender]++;

        emit ExecutionApproved(executionId, msg.sender);
    }

    function finalizeExecution(bytes32 executionId, bytes32 resultHash) external {
        ExecutionRecord storage rec = executions[executionId];
        require(rec.submitter != address(0), "Execution not found");
        require(msg.sender == rec.submitter, "Not submitter");
        require(!rec.completed, "Already completed");
        require(!rec.failed, "Cannot finalize failed");
        require(rec.completedLayers == rec.totalLayers, "Layers incomplete");
        require(_approvers[executionId].length >= requiredApprovals, "Insufficient approvals");

        rec.resultHash = resultHash;
        rec.completed = true;
        rec.endBlock = block.number;

        emit ExecutionFinalized(executionId, resultHash);
    }

    function failExecution(bytes32 executionId) external {
        ExecutionRecord storage rec = executions[executionId];
        require(rec.submitter != address(0), "Execution not found");
        require(msg.sender == rec.submitter, "Not submitter");
        require(!rec.completed, "Already completed");
        require(!rec.failed, "Execution failed");

        rec.failed = true;
        rec.endBlock = block.number;

        emit ExecutionFailed(executionId);
    }

    function getExecution(bytes32 executionId) external view returns (ExecutionRecord memory) {
        return executions[executionId];
    }

    function getLayerHash(bytes32 executionId, uint16 layerIndex) external view returns (bytes32) {
        return layerHashes[executionId][layerIndex];
    }

    function approvalCount(bytes32 executionId) external view returns (uint16) {
        return uint16(_approvers[executionId].length);
    }

    function getApprovers(bytes32 executionId) external view returns (address[] memory) {
        return _approvers[executionId];
    }

    function publishCanonicalDag(bytes32 dagHash, string calldata name) external {
        require(bytes(canonicalDagNames[dagHash]).length == 0, "DAG already published");
        canonicalDagNames[dagHash] = name;
        emit CanonicalDagPublished(dagHash, name);
    }
}
