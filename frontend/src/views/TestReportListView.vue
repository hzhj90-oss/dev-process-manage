<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">TEST REPORTS</div>
        <h1>测试报告</h1>
        <p>按测试轮次查看或导出报告，保留需求、用例、环境快照及执行证据。</p>
      </div>
      <el-button @click="loadData">刷新</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="报告由后端按轮次快照和执行历史实时生成，不会修改原轮次或执行结果。已完成和进行中的轮次均可查看。" />
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filters.keyword" class="filter-keyword" clearable
          placeholder="搜索轮次名称、代码版本" @keyup.enter="search" />
        <el-select v-model="filters.status" class="filter-status" clearable placeholder="全部轮次状态">
          <el-option v-for="item in statusOptions" :key="item.value"
            :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>轮次报告</strong><span class="muted-count">共 {{ total }} 条</span></div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="测试轮次" min-width="225">
          <template #default="{ row }">
            <div class="primary-cell">第 {{ row.cycleNo }} 轮 · {{ row.cycleName }}</div>
            <div class="secondary-cell">编号 #{{ row.id }} · {{ row.codeVersion }}</div>
          </template>
        </el-table-column>
        <el-table-column label="项目 / 版本" min-width="185">
          <template #default="{ row }">
            <div>{{ row.projectName }}</div>
            <div class="secondary-cell">{{ row.versionNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="环境" min-width="130">
          <template #default="{ row }">
            <div>{{ row.environmentName }}</div>
            <div class="secondary-cell">{{ row.environmentCode }}</div>
          </template>
        </el-table-column>
        <el-table-column label="执行结果" min-width="225">
          <template #default="{ row }">
            <div class="report-counts">
              <span class="pass-count">通过 {{ row.passCount || 0 }}</span>
              <span class="fail-count">失败 {{ row.failCount || 0 }}</span>
              <span class="blocked-count">阻塞 {{ row.blockedCount || 0 }}</span>
              <span class="skipped-count">跳过 {{ row.skippedCount || 0 }}</span>
            </div>
            <div class="secondary-cell">共 {{ row.caseCount || 0 }} 例 · 未执行 {{ row.notRunCount || 0 }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="155">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openReport(row)">查看报告</el-button>
            <el-button link type="success" @click="openReport(row, true)">下载 HTML</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无测试轮次报告" /></template>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange" @current-change="loadData" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElAlert, ElButton, ElCard, ElEmpty, ElInput, ElOption, ElPagination, ElSelect,
  ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { testCycleApi } from '../api/testCycles'
const statusOptions = [
  { value: 'PLANNED', label: '计划中' },
  { value: 'RUNNING', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'ABORTED', label: '已终止' }
]
const filters = reactive({ keyword: '', status: '' })
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)

async function loadData() {
  loading.value = true
  try {
    const result = await testCycleApi.page({
      keyword: filters.keyword.trim() || undefined,
      status: filters.status || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) {
    ElMessage.error(error.message || '加载报告列表失败')
  } finally {
    loading.value = false
  }
}
function search() { pageNum.value = 1; loadData() }
function resetFilters() { Object.assign(filters, { keyword: '', status: '' }); search() }
function handleSizeChange() { pageNum.value = 1; loadData() }
function statusLabel(value) {
  return statusOptions.find(item => item.value === value)?.label || value || '—'
}
function statusTag(value) {
  return ({ PLANNED: 'info', RUNNING: 'warning',
    COMPLETED: 'success', ABORTED: 'danger' })[value] || 'info'
}
function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—'
}
function openReport(row, download = false) {
  if (!row?.id) return
  const suffix = download ? '?download=true' : ''
  window.open(`/api/test-cycles/${row.id}/report${suffix}`, '_blank', 'noopener')
}
onMounted(loadData)
</script>

<style scoped>
.report-counts { display: flex; flex-wrap: wrap; gap: 9px; font-size: 11px; }
.pass-count { color: #299b80; }
.fail-count { color: #d65d68; }
.blocked-count { color: #c58a36; }
.skipped-count { color: #7d8797; }
</style>
