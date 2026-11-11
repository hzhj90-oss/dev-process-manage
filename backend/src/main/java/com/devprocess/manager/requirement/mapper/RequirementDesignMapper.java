package com.devprocess.manager.requirement.mapper;
import com.devprocess.manager.requirement.dto.RequirementDesignDTO;
import com.devprocess.manager.requirement.dto.RequirementDesignSaveRequest;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface RequirementDesignMapper {
    List<RequirementDesignDTO> selectByRequirement(@Param("requirementId") Long requirementId);
    RequirementDesignDTO selectById(@Param("requirementId") Long requirementId, @Param("id") Long id);
    Integer selectMaxRevisionNo(@Param("requirementId") Long requirementId);
    int insert(@Param("requirementId") Long requirementId, @Param("revisionNo") Integer revisionNo,
        @Param("request") RequirementDesignSaveRequest request);
}