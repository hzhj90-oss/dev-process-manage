package com.devprocess.manager.testcycle.mapper;

import com.devprocess.manager.testcycle.dto.*;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

public interface TestCycleMapper {
    List<TestCycleSummaryDTO> selectPage(@Param("versionId") Long versionId,
            @Param("environmentId") Long environmentId, @Param("status") String status,
            @Param("keyword") String keyword, @Param("offset") int offset,
            @Param("pageSize") int pageSize);
    long countPage(@Param("versionId") Long versionId, @Param("environmentId") Long environmentId,
            @Param("status") String status, @Param("keyword") String keyword);
    TestCycleDTO selectById(@Param("id") Long id);
    Map<String, Object> selectCycleForUpdate(@Param("id") Long id);
    Long selectVersionIdForUpdate(@Param("versionId") Long versionId);
    Map<String, Object> selectEnvironmentForUpdate(@Param("environmentId") Long environmentId);
    int selectNextCycleNo(@Param("versionId") Long versionId);
    int insertCycle(@Param("request") TestCycleSaveRequest request,
            @Param("cycleNo") int cycleNo, @Param("environmentSnapshotJson") String environmentSnapshotJson,
            @Param("scopeJson") String scopeJson);
    int updateCycle(@Param("id") Long id, @Param("request") TestCycleUpdateRequest request,
            @Param("environmentSnapshotJson") String environmentSnapshotJson,
            @Param("scopeJson") String scopeJson);
    int selectCaseCount(@Param("cycleId") Long cycleId);
    int selectNextCaseSequence(@Param("cycleId") Long cycleId);
    int countCycleCase(@Param("cycleId") Long cycleId, @Param("caseId") Long caseId);
    Long selectCycleCaseId(@Param("cycleId") Long cycleId, @Param("caseId") Long caseId);
    int insertCycleCase(@Param("cycleId") Long cycleId, @Param("caseId") Long caseId,
            @Param("revisionId") Long revisionId, @Param("snapshotJson") String snapshotJson,
            @Param("executionMode") String executionMode, @Param("sequenceNo") int sequenceNo);
    List<Map<String, Object>> selectRequirementsForCycle(
            @Param("caseId") Long caseId, @Param("versionId") Long versionId);
    int insertCycleCaseRequirement(@Param("cycleCaseId") Long cycleCaseId,
            @Param("requirementId") Long requirementId, @Param("coverageType") String coverageType,
            @Param("requirementSnapshotJson") String requirementSnapshotJson,
            @Param("designSnapshotJson") String designSnapshotJson);
    List<TestCycleCaseDTO> selectCases(@Param("cycleId") Long cycleId);
    List<TestCycleRequirementDTO> selectCaseRequirements(@Param("cycleCaseId") Long cycleCaseId);
    int deleteCaseRequirements(@Param("cycleId") Long cycleId,
            @Param("cycleCaseId") Long cycleCaseId);
    int deleteCycleCase(@Param("cycleId") Long cycleId, @Param("cycleCaseId") Long cycleCaseId);
    int updateStatus(@Param("id") Long id, @Param("status") String status,
            @Param("started") boolean started, @Param("completed") boolean completed);
}
