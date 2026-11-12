package com.devprocess.manager.testcase.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.testcase.dto.TestCaseDTO;
import com.devprocess.manager.testcase.mapper.TestCaseMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TestCaseRequirementFilterTest {
    private TestCaseMapper mapper;
    private TestCaseService service;

    @BeforeEach
    void setUp() {
        mapper = mock(TestCaseMapper.class);
        service = new TestCaseService(mapper, new ObjectMapper());
    }

    @Test
    void requirementFilterMustBeAppliedToBothPageAndTotal() {
        TestCaseDTO testCase = new TestCaseDTO();
        testCase.setId(8L);
        when(mapper.selectPage(null, null, null, null, null, 4L, 0, 10))
                .thenReturn(Collections.singletonList(testCase));
        when(mapper.countPage(null, null, null, null, null, 4L)).thenReturn(1L);

        com.devprocess.manager.common.web.PageResult<TestCaseDTO> result =
                service.page(null, null, null, null, null, 4L, 1, 10);

        assertEquals(1L, result.getTotal());
        assertEquals(1, result.getList().size());
        verify(mapper).selectPage(null, null, null, null, null, 4L, 0, 10);
        verify(mapper).countPage(null, null, null, null, null, 4L);
    }

    @Test
    void invalidRequirementIdMustFailBeforeAnySql() {
        for (Long id : new Long[] {0L, -1L}) {
            BusinessException exception = assertThrows(BusinessException.class,
                    () -> service.page(null, null, null, null, null, id, 1, 10));
            assertEquals(400, exception.getStatus());
        }
        verifyNoInteractions(mapper);
    }

    @Test
    void legacyUnfilteredPageMustRemainCompatible() {
        when(mapper.selectPage(null, null, null, null, null, null, 0, 10))
                .thenReturn(Collections.emptyList());
        when(mapper.countPage(null, null, null, null, null, null)).thenReturn(0L);

        assertEquals(0L, service.page(null, null, null, null, null, 1, 10).getTotal());
        verify(mapper).selectPage(null, null, null, null, null, null, 0, 10);
    }
}
