package com.devprocess.manager.project.mapper;

import com.devprocess.manager.project.dto.ProjectDTO;
import com.devprocess.manager.project.dto.ProjectSaveRequest;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface ProjectMapper {
    List<ProjectDTO> selectPage(@Param("keyword") String keyword,
                                @Param("status") String status,
                                @Param("offset") int offset,
                                @Param("pageSize") int pageSize);
    long countPage(@Param("keyword") String keyword, @Param("status") String status);
    ProjectDTO selectById(@Param("id") Long id);
    int countByCode(@Param("projectCode") String projectCode,
                    @Param("excludeId") Long excludeId);
    int insert(ProjectSaveRequest request);
    int update(@Param("id") Long id, @Param("request") ProjectSaveRequest request);
}