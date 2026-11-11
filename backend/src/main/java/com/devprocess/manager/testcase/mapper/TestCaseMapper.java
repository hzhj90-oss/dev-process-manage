package com.devprocess.manager.testcase.mapper;

import com.devprocess.manager.testcase.dto.TestCaseDTO;
import com.devprocess.manager.testcase.dto.TestCaseRequirementDTO;
import com.devprocess.manager.testcase.dto.TestCaseRevisionDTO;
import com.devprocess.manager.testcase.dto.TestCaseSaveRequest;
import com.devprocess.manager.testscript.dto.TestScriptDTO;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface TestCaseMapper {
    List<TestCaseDTO> selectPage(@Param("keyword") String keyword,
            @Param("status") String status, @Param("testType") String testType,
            @Param("priority") String priority, @Param("executionMode") String executionMode,
            @Param("offset") int offset, @Param("pageSize") int pageSize);
    long countPage(@Param("keyword") String keyword, @Param("status") String status,
            @Param("testType") String testType, @Param("priority") String priority,
            @Param("executionMode") String executionMode);
    TestCaseDTO selectById(@Param("id") Long id);
    TestCaseDTO selectByIdForUpdate(@Param("id") Long id);
    int countByCaseNo(@Param("caseNo") String caseNo, @Param("excludeId") Long excludeId);
    int insertMain(TestCaseSaveRequest request);
    int updateMain(@Param("id") Long id, @Param("request") TestCaseSaveRequest request,
            @Param("revisionNo") int revisionNo);
    int insertRevision(@Param("caseId") Long caseId, @Param("revisionNo") int revisionNo,
            @Param("request") TestCaseSaveRequest request, @Param("stepsJson") String stepsJson);
    List<TestCaseRevisionDTO> selectRevisions(@Param("caseId") Long caseId);
    TestCaseRevisionDTO selectRevisionById(@Param("caseId") Long caseId,
            @Param("revisionId") Long revisionId);
    List<TestCaseRequirementDTO> selectRequirementsByCase(@Param("caseId") Long caseId);
    List<TestCaseRequirementDTO> selectAvailableRequirements(@Param("versionId") Long versionId);
    int countRequirementsByIds(@Param("ids") List<Long> ids);
    int deleteRequirementsByCase(@Param("caseId") Long caseId);
    int insertRequirementCase(@Param("requirementId") Long requirementId,
            @Param("caseId") Long caseId);
    List<TestScriptDTO> selectEnabledScripts();
    TestScriptDTO selectEnabledScriptByIdForUpdate(@Param("id") Long id);
}