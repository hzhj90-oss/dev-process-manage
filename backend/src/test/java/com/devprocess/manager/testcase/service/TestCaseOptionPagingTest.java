package com.devprocess.manager.testcase.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testcase.dto.TestCaseRequirementDTO;
import com.devprocess.manager.testcase.mapper.TestCaseMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TestCaseOptionPagingTest {

    private final TestCaseMapper mapper = mock(TestCaseMapper.class);
    private final TestCaseService service = new TestCaseService(mapper, new ObjectMapper());

    @Test
    void returnsOnlyRequestedPageWithCountAndVersionScope() {
        TestCaseRequirementDTO item = new TestCaseRequirementDTO();
        item.setRequirementId(201L);
        item.setRequirementNo("REQ-201");
        when(mapper.countAvailableRequirements(6L)).thenReturn(205L);
        when(mapper.selectAvailableRequirementsPage(6L, 100, 100))
                .thenReturn(Collections.singletonList(item));

        PageResult<TestCaseRequirementDTO> result =
                service.availableRequirementsPage(6L, 2, 100);

        assertEquals(205L, result.getTotal());
        assertEquals(2, result.getPageNum());
        assertEquals(100, result.getPageSize());
        assertEquals(1, result.getList().size());
        assertEquals(201L, result.getList().get(0).getRequirementId());
        verify(mapper).countAvailableRequirements(6L);
        verify(mapper).selectAvailableRequirementsPage(6L, 100, 100);
        verify(mapper, never()).selectAvailableRequirements(any());
    }

    @Test
    void supportsAllVersionsButNeverReadsUnboundedSelector() {
        when(mapper.countAvailableRequirements(null)).thenReturn(1L);
        when(mapper.selectAvailableRequirementsPage(null, 0, 10))
                .thenReturn(Collections.emptyList());

        PageResult<TestCaseRequirementDTO> result =
                service.availableRequirementsPage(null, 1, 10);

        assertEquals(1L, result.getTotal());
        verify(mapper).selectAvailableRequirementsPage(null, 0, 10);
        verify(mapper, never()).selectAvailableRequirements(any());
    }

    @Test
    void rejectsInvalidPageSizesNegativeVersionsAndOffsetOverflowBeforeSql() {
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(0L, 1, 100)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(-1L, 1, 100)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(null, 0, 100)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(null, 1, 0)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(null, 1, 101)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.availableRequirementsPage(null, Integer.MAX_VALUE, 100)).getStatus());
        verifyNoInteractions(mapper);
    }
}
