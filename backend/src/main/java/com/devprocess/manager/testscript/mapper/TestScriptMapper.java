package com.devprocess.manager.testscript.mapper;

import com.devprocess.manager.testscript.dto.ScriptRevisionInsert;
import com.devprocess.manager.testscript.dto.ScriptSaveRequest;
import com.devprocess.manager.testscript.dto.TestScriptDTO;
import com.devprocess.manager.testscript.dto.TestScriptRevisionDTO;
import com.devprocess.manager.testscript.dto.TestScriptSummaryDTO;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

public interface TestScriptMapper {
    List<TestScriptSummaryDTO> selectPage(@Param("keyword") String keyword,
            @Param("language") String language, @Param("enabled") Boolean enabled,
            @Param("offset") int offset, @Param("pageSize") int pageSize);
    long countPage(@Param("keyword") String keyword, @Param("language") String language,
            @Param("enabled") Boolean enabled);
    TestScriptDTO selectById(@Param("id") Long id);
    Map<String, Object> selectMainForUpdate(@Param("id") Long id);
    TestScriptDTO selectEnabledScriptByIdForUpdate(@Param("id") Long id);
    int countByCode(@Param("scriptCode") String code, @Param("excludeId") Long excludeId);
    int insertMain(ScriptSaveRequest request);
    int updateMain(@Param("id") Long id, @Param("request") ScriptSaveRequest request,
            @Param("revisionNo") Integer revisionNo);
    int insertRevision(ScriptRevisionInsert revision);
    int updateCurrentRevision(@Param("id") Long id, @Param("revisionNo") Integer revisionNo,
            @Param("revisionId") Long revisionId);
    int updateEnabled(@Param("id") Long id, @Param("enabled") Boolean enabled);
    List<TestScriptRevisionDTO> selectRevisions(@Param("scriptId") Long scriptId);
    TestScriptRevisionDTO selectRevisionById(@Param("scriptId") Long scriptId,
            @Param("revisionId") Long revisionId);
}
