// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DAGRegistry} from "../src/dag-executor/DAGRegistry.sol";

contract DAGRegistryTest is Test {
    DAGRegistry registry;
    address executor = address(0xA11CE);
    address verifierB = address(0xB0B);
    address verifierC = address(0xC0C);

    bytes32 constant DAG_HASH = keccak256("payment-dag");
    bytes32 constant LAYER0 = keccak256("layer0");
    bytes32 constant LAYER1 = keccak256("layer1");
    bytes32 constant LAYER2 = keccak256("layer2");
    bytes32 constant LAYER3 = keccak256("layer3");
    bytes32 constant RESULT = keccak256("result");

    function setUp() public {
        registry = new DAGRegistry(2);
    }

    function test_registerExecution_success() public {
        vm.prank(executor);
        bytes32 id = registry.registerExecution(DAG_HASH, 4);
        assertTrue(id != bytes32(0));

        DAGRegistry.ExecutionRecord memory rec = registry.getExecution(id);
        assertEq(rec.dagHash, DAG_HASH);
        assertEq(rec.submitter, executor);
        assertEq(rec.totalLayers, 4);
        assertEq(rec.completedLayers, 0);
        assertFalse(rec.completed);
        assertFalse(rec.failed);
    }

    function test_registerExecution_revertsZeroLayers() public {
        vm.prank(executor);
        vm.expectRevert("Zero layers");
        registry.registerExecution(DAG_HASH, 0);
    }

    function test_completeLayer_storesHash() public {
        bytes32 id = _register(executor, 4);

        vm.startPrank(executor);
        registry.completeLayer(id, 0, LAYER0);
        registry.completeLayer(id, 1, LAYER1);
        vm.stopPrank();

        assertEq(registry.getLayerHash(id, 0), LAYER0);
        assertEq(registry.getLayerHash(id, 1), LAYER1);
        assertEq(registry.getExecution(id).completedLayers, 2);
    }

    function test_completeLayer_revertsZeroHash() public {
        bytes32 id = _register(executor, 1);
        vm.prank(executor);
        vm.expectRevert("Zero layer hash");
        registry.completeLayer(id, 0, bytes32(0));
    }

    function test_completeLayer_revertsOutOfOrder() public {
        bytes32 id = _register(executor, 2);
        vm.prank(executor);
        vm.expectRevert("Layer out of order");
        registry.completeLayer(id, 1, LAYER1);
    }

    function test_completeLayer_revertsWrongSubmitter() public {
        bytes32 id = _register(executor, 1);
        vm.prank(verifierB);
        vm.expectRevert("Not submitter");
        registry.completeLayer(id, 0, LAYER0);
    }

    function test_finalize_requiresApprovals() public {
        bytes32 id = _completeAllLayers(executor);

        vm.prank(executor);
        vm.expectRevert("Insufficient approvals");
        registry.finalizeExecution(id, RESULT);
    }

    function test_finalize_success_withApprovals() public {
        bytes32 id = _completeAllLayers(executor);

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        vm.prank(executor);
        registry.finalizeExecution(id, RESULT);

        DAGRegistry.ExecutionRecord memory rec = registry.getExecution(id);
        assertTrue(rec.completed);
        assertEq(rec.resultHash, RESULT);
        assertEq(registry.verificationScore(verifierB), 1);
        assertEq(registry.verificationScore(verifierC), 1);
        assertEq(registry.verificationScore(executor), 0);
    }

    function test_approveExecution_revertsSubmitter() public {
        bytes32 id = _register(executor, 1);

        vm.prank(executor);
        vm.expectRevert("Submitter cannot approve");
        registry.approveExecution(id);
    }

    function test_approveExecution_revertsDuplicate() public {
        bytes32 id = _register(executor, 1);
        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierB);
        vm.expectRevert("Already approved");
        registry.approveExecution(id);
    }

    function test_failExecution_blocksFinalize() public {
        bytes32 id = _register(executor, 1);
        vm.startPrank(executor);
        registry.failExecution(id);
        vm.stopPrank();

        vm.prank(verifierB);
        vm.expectRevert("Cannot approve failed");
        registry.approveExecution(id);

        vm.prank(executor);
        vm.expectRevert("Cannot finalize failed");
        registry.finalizeExecution(id, RESULT);
    }

    function test_publishCanonicalDag() public {
        bytes32 hash = keccak256("canonical");
        registry.publishCanonicalDag(hash, "payment");
        assertEq(registry.canonicalDagNames(hash), "payment");
    }

    function test_publishCanonicalDag_revertsDuplicate() public {
        bytes32 hash = keccak256("canonical");
        registry.publishCanonicalDag(hash, "payment");
        vm.expectRevert("DAG already published");
        registry.publishCanonicalDag(hash, "payment-v2");
    }

    function test_registerExecution_uniqueIdsViaNonce() public {
        vm.startPrank(executor);
        bytes32 id1 = registry.registerExecution(DAG_HASH, 1);
        bytes32 id2 = registry.registerExecution(DAG_HASH, 1);
        vm.stopPrank();

        assertTrue(id1 != id2);
        assertEq(registry.nonces(executor), 2);
    }

    function test_requiredApprovals_immutable() public view {
        assertEq(registry.requiredApprovals(), 2);
    }

    function test_completeLayer_revertsExecutionNotFound() public {
        vm.prank(executor);
        vm.expectRevert("Execution not found");
        registry.completeLayer(bytes32(uint256(1)), 0, LAYER0);
    }

    function test_completeLayer_revertsAlreadyCompleted() public {
        bytes32 id = _finalizeWithApprovals(executor);

        vm.prank(executor);
        vm.expectRevert("Already completed");
        registry.completeLayer(id, 0, LAYER0);
    }

    function test_completeLayer_revertsAfterFailed() public {
        bytes32 id = _register(executor, 2);
        vm.prank(executor);
        registry.failExecution(id);

        vm.prank(executor);
        vm.expectRevert("Execution failed");
        registry.completeLayer(id, 0, LAYER0);
    }

    function test_approveExecution_revertsExecutionNotFound() public {
        vm.prank(verifierB);
        vm.expectRevert("Execution not found");
        registry.approveExecution(bytes32(uint256(1)));
    }

    function test_approveExecution_revertsAlreadyCompleted() public {
        bytes32 id = _finalizeWithApprovals(executor);

        vm.prank(verifierB);
        vm.expectRevert("Already completed");
        registry.approveExecution(id);
    }

    function test_approveExecution_incrementsScorePerVerifier() public {
        bytes32 id1 = _register(executor, 1);
        bytes32 id2 = _register(executor, 1);

        vm.prank(verifierB);
        registry.approveExecution(id1);
        vm.prank(verifierB);
        registry.approveExecution(id2);

        assertEq(registry.verificationScore(verifierB), 2);
        assertEq(registry.approvalCount(id1), 1);
        assertEq(registry.approvalCount(id2), 1);
    }

    function test_getApprovers_returnsAllApprovers() public {
        bytes32 id = _register(executor, 1);

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        address[] memory approvers = registry.getApprovers(id);
        assertEq(approvers.length, 2);
        assertEq(approvers[0], verifierB);
        assertEq(approvers[1], verifierC);
    }

    function test_finalize_revertsExecutionNotFound() public {
        vm.prank(executor);
        vm.expectRevert("Execution not found");
        registry.finalizeExecution(bytes32(uint256(1)), RESULT);
    }

    function test_finalize_revertsNotSubmitter() public {
        bytes32 id = _completeAllLayers(executor);

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        vm.prank(verifierB);
        vm.expectRevert("Not submitter");
        registry.finalizeExecution(id, RESULT);
    }

    function test_finalize_revertsLayersIncomplete() public {
        bytes32 id = _register(executor, 2);

        vm.startPrank(executor);
        registry.completeLayer(id, 0, LAYER0);
        vm.stopPrank();

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        vm.prank(executor);
        vm.expectRevert("Layers incomplete");
        registry.finalizeExecution(id, RESULT);
    }

    function test_finalize_revertsAlreadyCompleted() public {
        bytes32 id = _finalizeWithApprovals(executor);

        vm.prank(executor);
        vm.expectRevert("Already completed");
        registry.finalizeExecution(id, RESULT);
    }

    function test_finalize_setsEndBlock() public {
        bytes32 id = _completeAllLayers(executor);

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        uint256 blockBefore = block.number;
        vm.prank(executor);
        registry.finalizeExecution(id, RESULT);

        DAGRegistry.ExecutionRecord memory rec = registry.getExecution(id);
        assertEq(rec.endBlock, blockBefore);
    }

    function test_failExecution_revertsExecutionNotFound() public {
        vm.prank(executor);
        vm.expectRevert("Execution not found");
        registry.failExecution(bytes32(uint256(1)));
    }

    function test_failExecution_revertsNotSubmitter() public {
        bytes32 id = _register(executor, 1);

        vm.prank(verifierB);
        vm.expectRevert("Not submitter");
        registry.failExecution(id);
    }

    function test_failExecution_revertsAlreadyCompleted() public {
        bytes32 id = _finalizeWithApprovals(executor);

        vm.prank(executor);
        vm.expectRevert("Already completed");
        registry.failExecution(id);
    }

    function test_failExecution_revertsDuplicateFail() public {
        bytes32 id = _register(executor, 1);

        vm.startPrank(executor);
        registry.failExecution(id);
        vm.expectRevert("Execution failed");
        registry.failExecution(id);
        vm.stopPrank();
    }

    function test_failExecution_setsEndBlock() public {
        bytes32 id = _register(executor, 1);

        uint256 blockBefore = block.number;
        vm.prank(executor);
        registry.failExecution(id);

        DAGRegistry.ExecutionRecord memory rec = registry.getExecution(id);
        assertTrue(rec.failed);
        assertEq(rec.endBlock, blockBefore);
    }

    function test_completeAllLayers_enablesFinalize() public {
        bytes32 id = _register(executor, 1);

        vm.startPrank(executor);
        registry.completeLayer(id, 0, LAYER0);
        vm.stopPrank();

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        vm.prank(executor);
        registry.finalizeExecution(id, RESULT);

        assertEq(registry.getExecution(id).completedLayers, 1);
        assertTrue(registry.getExecution(id).completed);
    }

    function _finalizeWithApprovals(address who) internal returns (bytes32 id) {
        id = _completeAllLayers(who);

        vm.prank(verifierB);
        registry.approveExecution(id);
        vm.prank(verifierC);
        registry.approveExecution(id);

        vm.prank(who);
        registry.finalizeExecution(id, RESULT);
    }

    function _register(address who, uint16 layers) internal returns (bytes32 id) {
        vm.prank(who);
        return registry.registerExecution(DAG_HASH, layers);
    }

    function _completeAllLayers(address who) internal returns (bytes32 id) {
        id = _register(who, 4);
        vm.startPrank(who);
        registry.completeLayer(id, 0, LAYER0);
        registry.completeLayer(id, 1, LAYER1);
        registry.completeLayer(id, 2, LAYER2);
        registry.completeLayer(id, 3, LAYER3);
        vm.stopPrank();
    }
}
