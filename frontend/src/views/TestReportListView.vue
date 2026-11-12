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
    <el-alert v-if="listError" type="error" :closable="false" show-icon style="margin-bottom: 16px"
      :title="'报告列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
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
        <el-table-column label="操作" width="445" fixed="right">
          <template #default="{ row }">
            <el-button link type="warning" @click="openReview(row)">结果复核</el-button>
            <el-button link type="primary" @click="openCompare(row)">轮次对比</el-button>
            <el-button link type="primary" @click="openReport(row)">查看报告</el-button>
            <el-button link type="success" @click="openReport(row, true)">下载 HTML</el-button>
            <el-button link type="primary" @click="downloadCsv(row)">下载 CSV</el-button>
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

    <el-dialog v-model="compareDialog" title="测试轮次结果对比" width="1060px" top="5vh"
      destroy-on-close @closed="invalidateCompare">
      <div v-loading="compareLoading" class="review-dialog-content">
        <el-alert v-if="compareError" type="error" :closable="false" show-icon :title="compareError" />
        <el-button v-if="compareError" size="small" type="primary" plain
          style="margin:12px 0" @click="retryCompare">重试读取轮次对比</el-button>
        <template v-if="compareData">
          <p class="review-cycle-name">
            第 {{ compareData.cycleNo }} 轮 · {{ compareData.cycleName }}
            <span v-if="compareData.previousCycleId">
              对比第 {{ compareData.previousCycleNo }} 轮 · {{ compareData.previousCycleName }}
            </span>
          </p>
          <el-alert v-if="!compareData.previousCycleId" type="info" :closable="false" show-icon
            title="同版本暂无更早的已完成测试轮次，无法计算复测改善或回归失败。" />
          <template v-else>
            <div class="comparison-context">
              <div><strong>上一轮：</strong>{{ compareData.previousEnvironmentName || '环境未记录' }}
                / {{ compareData.previousCodeVersion || '代码版本未记录' }}</div>
              <div><strong>本轮：</strong>{{ compareData.environmentName || '环境未记录' }}
                / {{ compareData.codeVersion || '代码版本未记录' }}</div>
            </div>
            <el-alert v-for="item in compareContextWarnings" :key="item.text"
              :type="item.type" show-icon :closable="false" style="margin:9px 0"
              :title="item.text" />
            <el-alert v-if="compareData.cycleStatus !== 'COMPLETED'" type="warning" show-icon
              :closable="false" title="当前轮次尚未完成，结果可能继续变化。本对比是实时只读快照。" />
            <el-alert type="info" show-icon :closable="false" style="margin:12px 0"
              title="仅按同一原始测试用例 ID 对比结果；通过不等于已确认根因修复。新增/移出用例单独列出。" />
            <div class="review-summary">
              <span class="pass-count">失败转通过 {{ compareData.counts.FIXED || 0 }}</span>
              <span class="fail-count">新增回归失败 {{ compareData.counts.REGRESSION || 0 }}</span>
              <span class="blocked-count">持续失败/阻塞 {{ compareData.counts.STILL_FAIL || 0 }}</span>
              <span>持续通过 {{ compareData.counts.STILL_PASS || 0 }}</span>
              <span>首次通过 {{ compareData.counts.FIRST_PASS || 0 }}</span>
              <span>范围变化 {{ (compareData.counts.NEW_CASE || 0) + (compareData.counts.REMOVED_CASE || 0) }}</span>
            </div>
            <div class="review-filter">
              <el-radio-group v-model="compareFilter" size="small">
                <el-radio-button label="ISSUES">需要关注</el-radio-button>
                <el-radio-button label="REGRESSION">回归失败</el-radio-button>
                <el-radio-button label="STILL_FAIL">持续失败</el-radio-button>
                <el-radio-button label="FIXED">已转通过</el-radio-button>
                <el-radio-button label="SCOPE">范围变化</el-radio-button>
                <el-radio-button label="ALL">全部</el-radio-button>
              </el-radio-group>
              <span>当前显示 {{ compareRows.length }} / {{ compareData.total }} 条</span>
            </div>
            <el-table :data="compareRows" max-height="460" stripe
              :row-key="item => String(item.testCaseId ?? '') + ':' + item.caseNo + ':' + item.change">
              <el-table-column label="用例编号 / 名称" min-width="290">
                <template #default="{ row }">
                  <div class="primary-cell">{{ row.caseNo }}</div>
                  <div class="secondary-cell">{{ row.title }}</div>
                </template>
              </el-table-column>
              <el-table-column label="上一轮结果" width="120">
                <template #default="{ row }">
                  <el-tag v-if="row.previousResult" :type="reviewResultTag(row.previousResult)" size="small">
                    {{ reviewResultLabel(row.previousResult) }}
                  </el-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="本轮结果" width="120">
                <template #default="{ row }">
                  <el-tag v-if="row.currentResult" :type="reviewResultTag(row.currentResult)" size="small">
                    {{ reviewResultLabel(row.currentResult) }}
                  </el-tag>
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="变化分类" width="170">
                <template #default="{ row }">
                  <el-tag :type="compareTag(row.change)" size="small">
                    {{ compareCategories[row.change] || row.change }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-button size="small" plain type="primary" style="margin-top:10px"
              @click="openReport({id:compareData.previousCycleId})">查看上一轮报告</el-button>
          </template>
        </template>
      </div>
      <template #footer><el-button @click="compareDialog = false">关闭</el-button></template>
    </el-dialog>
    <el-dialog v-model="reviewDialog" title="测试结果复核" width="1020px" top="5vh" destroy-on-close
      @closed="invalidateReview">
      <div v-loading="reviewLoading" class="review-dialog-content">
        <el-alert v-if="reviewError" type="error" :closable="false" show-icon :title="reviewError" />
        <el-button v-if="reviewError" type="primary" plain size="small" style="margin: 12px 0"
          @click="retryReview">重试读取复核数据</el-button>
        <template v-if="reviewData">
          <p class="review-cycle-name">{{ reviewData.cycleName }} · 共 {{ reviewData.total }} 条用例</p>
          <div class="review-summary">
            <span>通过 {{ reviewData.counts?.PASS || 0 }}</span>
            <span class="fail-count">失败 {{ reviewData.counts?.FAIL || 0 }}</span>
            <span class="blocked-count">阻塞 {{ reviewData.counts?.BLOCKED || 0 }}</span>
            <span>跳过 {{ reviewData.counts?.SKIPPED || 0 }}</span>
            <span>未执行 {{ reviewData.counts?.NOT_RUN || 0 }}</span>
          </div>
          <div class="review-filter">
            <el-radio-group v-model="reviewFilter" size="small">
              <el-radio-button label="ISSUES">失败/阻塞</el-radio-button>
              <el-radio-button label="NOT_RUN">未执行</el-radio-button>
              <el-radio-button label="ALL">全部用例</el-radio-button>
            </el-radio-group>
            <span>当前显示 {{ reviewRows.length }} 条</span>
          </div>
          <el-table :data="reviewRows" row-key="cycleCaseId" stripe max-height="480">
            <el-table-column label="用例" min-width="240">
              <template #default="{ row }">
                <div class="primary-cell">{{ row.caseNo }}</div>
                <div class="secondary-cell">{{ row.title }}</div>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="reviewResultTag(row.latestResult)">
                  {{ reviewResultLabel(row.latestResult) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="executionStatus" label="用例状态" width="130" />
            <el-table-column prop="attemptCount" label="尝试次数" width="95" />
            <el-table-column label="最近执行" min-width="155">
              <template #default="{ row }">
                <div v-if="row.executionId">#{{ row.executionId }} · {{ row.runnerType }}</div>
                <div class="secondary-cell">{{ row.attemptStatus || '暂无记录' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110">
              <template #default="{ row }">
                <el-button link type="primary" :disabled="!row.taskId" @click="goToTask(row)">
                  查看执行
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="此筛选下没有用例，可切换到全部用例" />
            </template>
          </el-table>
        </template>
      </div>
      <template #footer>
        <el-button @click="reviewDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElInput, ElOption, ElPagination, ElSelect,
  ElRadioGroup, ElRadioButton,
  ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { testCycleApi } from '../api/testCycles'
import { filteredReviewRows, positiveId } from '../utils/reportReview'
import { compareCategories, readComparison, filteredComparisonRows,
  comparisonContextWarnings } from '../utils/roundComparison'
import { createLatestRequest } from '../utils/latestRequest'
const router = useRouter()
const listGate = createLatestRequest()
const listError = ref('')
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


const compareDialog = ref(false)
const compareLoading = ref(false)
const compareError = ref('')
const compareData = ref(null)
const compareTarget = ref(null)
const compareFilter = ref('ISSUES')
const compareRows = computed(() => filteredComparisonRows(compareData.value?.rows, compareFilter.value))
const compareContextWarnings = computed(() => comparisonContextWarnings(compareData.value))
let compareSequence = 0

function invalidateCompare() { compareSequence++ }
function retryCompare() {
  if (compareDialog.value && compareTarget.value && !compareLoading.value) {
    void openCompare(compareTarget.value)
  }
}
async function openCompare(row) {
  const cycleId = positiveId(row?.id)
  const versionId = positiveId(row?.versionId)
  if (!cycleId || !versionId) return
  const request = ++compareSequence
  compareTarget.value = { id: cycleId, versionId }
  compareDialog.value = true
  compareLoading.value = true
  compareError.value = ''
  compareData.value = null
  compareFilter.value = 'ISSUES'
  try {
    const result = readComparison(await testCycleApi.compare(cycleId), cycleId, versionId)
    if (request !== compareSequence || !compareDialog.value) return
    compareData.value = result
  } catch (error) {
    if (request === compareSequence && compareDialog.value) {
      compareError.value = error.message || '无法读取轮次对比，请重试'
    }
  } finally {
    if (request === compareSequence) compareLoading.value = false
  }
}
function compareTag(value) {
  return ({ FIXED: 'success', FIRST_PASS: 'success', REGRESSION: 'danger',
    STILL_FAIL: 'warning', STILL_PASS: 'info', NEW_CASE: 'primary',
    REMOVED_CASE: 'info', CHANGED: 'info' })[value] || 'info'
}

const reviewDialog = ref(false)
const reviewLoading = ref(false)
const reviewError = ref('')
const reviewData = ref(null)
const reviewRow = ref(null)
const reviewFilter = ref('ISSUES')
const reviewRows = computed(() => filteredReviewRows(reviewData.value?.rows, reviewFilter.value))
let reviewSequence = 0

function invalidateReview() { reviewSequence++ }
function retryReview() {
  if (reviewRow.value && reviewDialog.value) openReview(reviewRow.value)
}
async function openReview(row) {
  if (!positiveId(row?.id)) return
  const request = ++reviewSequence
  reviewRow.value = { id: row.id }
  reviewDialog.value = true
  reviewLoading.value = true
  reviewError.value = ''
  reviewData.value = null
  reviewFilter.value = 'ISSUES'
  try {
    const result = await testCycleApi.review(row.id)
    if (request !== reviewSequence || !reviewDialog.value) return
    if (positiveId(result?.cycleId) !== positiveId(row.id) || !Array.isArray(result?.rows)) {
      throw new Error('复核数据与当前轮次不一致')
    }
    reviewData.value = result
  } catch (error) {
    if (request === reviewSequence && reviewDialog.value) reviewError.value = error.message || '读取复核数据失败'
  } finally {
    if (request === reviewSequence) reviewLoading.value = false
  }
}
function reviewResultLabel(value) {
  return ({ PASS: '通过', FAIL: '失败', BLOCKED: '阻塞',
    SKIPPED: '跳过', NOT_RUN: '未执行' })[value] || value || '未执行'
}
function reviewResultTag(value) {
  return ({ PASS: 'success', FAIL: 'danger', BLOCKED: 'warning',
    SKIPPED: 'info', NOT_RUN: 'info' })[value] || 'info'
}
function goToTask(row) {
  const cycleId = positiveId(reviewData.value?.cycleId)
  const taskId = positiveId(row?.taskId)
  const cycleCaseId = positiveId(row?.cycleCaseId)
  if (!cycleId || !taskId || !cycleCaseId) {
    ElMessage.warning('没有可定位的执行任务')
    return
  }
  reviewDialog.value = false
  router.push({
    name: 'execution-tasks',
    query: {
      cycleId: String(cycleId),
      taskId: String(taskId),
      cycleCaseId: String(cycleCaseId)
    }
  })
}

async function loadData() {
  const token = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await testCycleApi.page({
      keyword: filters.keyword.trim() || undefined,
      status: filters.status || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    if (!listGate.isCurrent(token)) return
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) {
    if (!listGate.isCurrent(token)) return
    rows.value = []
    total.value = 0
    listError.value = error.message || '无法加载报告列表，请重试'
  } finally {
    if (listGate.isCurrent(token)) loading.value = false
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
function downloadCsv(row) {
  if (!row?.id) return
  // Navigate via an ephemeral anchor to avoid popup blockers for CSV attachments.
  const a = document.createElement('a')
  a.href = `/api/test-cycles/${row.id}/report.csv`
  a.download = `test-cycle-${row.id}-report.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
onMounted(loadData)
</script>

<style scoped>
.review-dialog-content { min-height: 150px; }
.review-cycle-name { font-size: 13px; font-weight: 600; color: #34425b; margin: 0 0 12px; }
.comparison-context { border: 1px solid #e5eaf2; border-radius: 8px; background: #fafbfe; padding: 10px 12px; color: #53627b; font-size: 12px; line-height: 1.9; margin: 10px 0; }
.comparison-context strong { margin-right: 6px; color: #34425b; }
.review-summary { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; margin-bottom: 14px; }
.review-filter { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.review-filter span { color: #7c899b; font-size: 12px; }
.report-counts { display: flex; flex-wrap: wrap; gap: 9px; font-size: 11px; }
.pass-count { color: #299b80; }
.fail-count { color: #d65d68; }
.blocked-count { color: #c58a36; }
.skipped-count { color: #7d8797; }
</style>
