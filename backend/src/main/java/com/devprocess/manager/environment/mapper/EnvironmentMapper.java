package com.devprocess.manager.environment.mapper;

import com.devprocess.manager.environment.dto.EnvironmentDTO;
import com.devprocess.manager.environment.dto.EnvironmentSaveRequest;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface EnvironmentMapper {
    List<EnvironmentDTO> selectList(@Param("activeOnly") Boolean activeOnly);
    EnvironmentDTO selectById(@Param("id") Long id);
    EnvironmentDTO selectByIdForUpdate(@Param("id") Long id);
    int countByCode(@Param("code") String code, @Param("excludeId") Long excludeId);
    int insert(EnvironmentSaveRequest request);
    int update(@Param("id") Long id, @Param("request") EnvironmentSaveRequest request);
}
