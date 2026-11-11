package com.devprocess.manager.version.mapper;

import com.devprocess.manager.version.dto.VersionDTO;
import com.devprocess.manager.version.dto.VersionSaveRequest;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface VersionMapper {
    List<VersionDTO> selectPage(@Param("projectId") Long projectId,
                                @Param("keyword") String keyword,
                                @Param("status") String status,
                                @Param("offset") int offset,
                                @Param("pageSize") int pageSize);
    long countPage(@Param("projectId") Long projectId,
                   @Param("keyword") String keyword,
                   @Param("status") String status);
    VersionDTO selectById(@Param("id") Long id);
    int countByProjectAndNo(@Param("projectId") Long projectId,
                            @Param("versionNo") String versionNo,
                            @Param("excludeId") Long excludeId);
    int insert(VersionSaveRequest request);
    int update(@Param("id") Long id, @Param("request") VersionSaveRequest request);
}