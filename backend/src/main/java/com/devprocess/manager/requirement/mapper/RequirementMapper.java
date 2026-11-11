package com.devprocess.manager.requirement.mapper;
import com.devprocess.manager.requirement.dto.RequirementDTO;
import com.devprocess.manager.requirement.dto.RequirementSaveRequest;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface RequirementMapper {
    List<RequirementDTO> selectPage(@Param("versionId") Long versionId, @Param("keyword") String keyword,
        @Param("status") String status, @Param("priority") String priority,
        @Param("offset") int offset, @Param("pageSize") int pageSize);
    long countPage(@Param("versionId") Long versionId, @Param("keyword") String keyword,
        @Param("status") String status, @Param("priority") String priority);
    RequirementDTO selectById(@Param("id") Long id);
    RequirementDTO selectByIdForUpdate(@Param("id") Long id);
    int countByVersionAndNo(@Param("versionId") Long versionId, @Param("requirementNo") String no,
        @Param("excludeId") Long excludeId);
    int insert(RequirementSaveRequest request);
    int update(@Param("id") Long id, @Param("request") RequirementSaveRequest request);
}