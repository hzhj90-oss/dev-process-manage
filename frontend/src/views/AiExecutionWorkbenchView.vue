<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">CHATGPT EXECUTION</div>
        <h1>ChatGPT 执行台</h1>
        <p>查看等待 ChatGPT 处理的测试用例，生成单条任务的执行指令并跟踪执行状态。</p>
      </div>
      <el-button :loading="loading" @click="loadQueue">刷新队列</el-button>
    </div>

    <el-alert type="info" show-icon :closable="false"
      title="本页面不会自动领取任务。复制指令后，须交给能够访问本机后端的 ChatGPT 执行，系统才会记录真实测试结果。" />

    <el-card shadow="never" class="queue-card">
      <div class="queue-heading">
        <strong>待执行 AI 用例</strong>
        <span>当前显示 {{ queue.length }} 条（最多 20 条）</span>
      </div>
      <div v-if="errorMessage" role="alert" class="queue-error">{{ errorMessage }}</div>
      <el-table v-loading="loading" :data="queue" row-key="task.id" stripe>
        <el-table-column label="任务编号" min-width="210">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.task.taskNo }}</div>
            <div class="secondary-cell">Task #{{ row.task.id }} · Execution #{{ row.execution.id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="测试用例" min-width="260">
          <template #default="{ row }">
            <div class="primary-cell">{{ summarizeAiTask(row).caseNo }}</div>
            <div>{{ summarizeAiTask(row).title }}</div>
          </template>
        </el-table-column>
        <el-table-column label="测试轮次 / 环境" min-width="230">
          <template #default="{ row }">
            <div>{{ row.task.cycleName }}</div>
            <div class="secondary-cell">{{ row.task.environmentName }} / {{ row.task.environmentType }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预期结果" min-width="230">
          <template #default="{ row }">{{ summarizeAiTask(row).expected }}</template>
        </el-table-column>
        <el-table-column label="操作" width="205" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="previewTask(row)">生成执行指令</el-button>
            <el-button link @click="trackTask(row.task.id)">查看进度</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="当前没有可领取的 ChatGPT 测试用例" />
        </template>
      </el-table>
    </el-card>


    <el-card shadow="never" class="queue-card" aria-label="ChatGPT 审计检索">
      <div class="queue-heading">
        <strong>ChatGPT 执行审计检索</strong>
        <span>只读 · 最多每页 50 条 · 导出上限 500 条</span>
      </div>
      <div class="audit-search">
        <el-input v-model="auditFilters.keyword" clearable placeholder="用例编号 / 任务编号 / 轮次名称"
          maxlength="100" @keyup.enter="searchAudit" />
        <el-select v-model="auditFilters.status" placeholder="全部任务状态" clearable>
          <el-option v-for="status in auditTaskStatuses" :key="status" :label="status" :value="status" />
        </el-select>
        <el-select v-model="auditFilters.result" placeholder="全部执行结果" clearable>
          <el-option v-for="result in ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']"
            :key="result" :label="result" :value="result" />
        </el-select>
        <el-checkbox v-model="auditFilters.recoveredOnly">仅中断恢复记录</el-checkbox>
        <el-button type="primary" :loading="auditLoading" @click="searchAudit">查询</el-button>
        <el-button @click="resetAudit">重置</el-button>
        <el-button :loading="auditExporting" :disabled="auditLoading || auditTotal === 0 || auditDirty"
          @click="exportAudit">导出筛选结果 CSV</el-button>
        <span v-if="auditDirty" class="secondary-cell">筛选条件已修改，请先点击查询</span>
      </div>
      <div v-if="auditError" role="alert" class="queue-error">{{ auditError }}</div>
      <el-table v-loading="auditLoading" :data="auditRows" stripe row-key="taskId">
        <el-table-column label="任务 / 用例" min-width="230">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.caseNo || '—' }}</div>
            <div class="secondary-cell">{{ row.taskNo }} · #{{ row.taskId }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="cycleName" label="测试轮次" min-width="160" />
        <el-table-column label="任务状态" min-width="118">
          <template #default="{ row }">
            <el-tag size="small" :type="stateTag(row.taskStatus)">{{ row.taskStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最新执行" min-width="160">
          <template #default="{ row }">
            <div>#{{ row.executionId }} · Attempt {{ row.attemptNo }}</div>
            <div class="secondary-cell">{{ row.executionStatus }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="结果" min-width="85">
          <template #default="{ row }">{{ row.result || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="trackTask(row.taskId)">查看历史</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="当前筛选条件没有 ChatGPT 执行记录" /></template>
      </el-table>
      <div class="audit-pagination">
        <el-pagination v-model:current-page="auditPage" v-model:page-size="auditPageSize"
          :total="auditTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next"
          @size-change="auditPageChanged" @current-change="loadAudit" />
      </div>
    </el-card>

    <el-card shadow="never" class="queue-card" aria-label="ChatGPT 任务状态追踪">
      <div class="queue-heading"><strong>任务状态追踪</strong><span>每 10 秒自动刷新已选任务</span></div>
      <div class="tracking-toolbar">
        <el-input v-model="trackedTaskId" placeholder="输入任务 ID，或从上方选择" clearable />
        <el-button :loading="trackingLoading" @click="loadTrackedStatus">查询状态</el-button>
      </div>
      <div v-if="trackingError" role="alert" class="queue-error">{{ trackingError }}</div>
      <el-alert v-if="trackedAttention" class="tracking-alert" show-icon :closable="false"
        :type="trackedAttention.type" :title="trackedAttention.title"
        :description="trackedAttention.description" />
      <div v-if="trackedDetail?.task" class="tracking-content">
        <div><strong>{{ trackedDetail.task.taskNo }}</strong>
          <el-tag size="small" :type="stateTag(trackedDetail.task.taskStatus)">{{ trackedDetail.task.taskStatus }}</el-tag>
        </div>
        <p>最新尝试：#{{ trackedDetail.executions?.[0]?.attemptNo || '—' }} ·
          执行记录 #{{ trackedDetail.executions?.[0]?.id || '—' }} ·
          状态 {{ trackedDetail.executions?.[0]?.executionStatus || '—' }} ·
          结果 {{ trackedDetail.executions?.[0]?.result || '尚未产生' }}</p>
        <div class="tracking-actions">
          <el-button v-if="aiContinuationState(trackedDetail)" type="primary" plain @click="previewContinuation">
            {{ aiContinuationState(trackedDetail).mode === 'MANUAL_RECOVERY' ? '查看人工恢复指引' : '生成续执行指令' }}
          </el-button>
          <el-button v-if="aiAuditAttempts.length" plain @click="copyDiagnostic">复制脱敏诊断摘要</el-button>
          <el-button v-if="trackedDetail.task.taskStatus === 'RECOVERY_REQUIRED'" link @click="goToExecutionTasks">前往执行任务页</el-button>
          <span>操作前重新核对任务状态；不会自动恢复或重复执行。</span>
        </div>
        <div v-if="aiAuditAttempts.length" class="audit-history" aria-label="ChatGPT 历次执行记录">
          <strong>执行历史（最近 {{ aiAuditAttempts.length }} 次）</strong>
          <div v-for="item in aiAuditAttempts" :key="item.executionId" class="audit-attempt">
            <div class="audit-attempt-header">
              <strong>尝试 #{{ item.attemptNo }} · 执行记录 #{{ item.executionId }}</strong>
              <el-tag size="small" :type="stateTag(item.status)">{{ item.status }}</el-tag>
              <el-tag v-if="item.result !== '—'" size="small">{{ item.result }}</el-tag>
            </div>
            <p>事件 {{ item.eventCount }} 条 · 检查点 {{ item.hasCheckpoint ? '已保存' : '无' }}（仅显示标记）</p>
            <div v-for="(event, index) in item.events" :key="index" class="tracking-event">
              {{ event.at }} · {{ event.type }} — {{ event.content }}
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-dialog v-model="promptDialog" :title="promptTitle" width="760px" destroy-on-close>
      <p class="prompt-explain">指令只包含任务标识和执行流程，不包含原始环境凭据。ChatGPT 会在执行前重新获取最新快照和任务状态。</p>
      <el-input v-model="promptText" type="textarea" :rows="16" readonly />
      <template #footer>
        <el-button @click="promptDialog = false">关闭</el-button>
        <el-button type="primary" @click="copyPrompt">复制执行指令</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElCard, ElCheckbox, ElDialog, ElEmpty, ElInput, ElMessage,
  ElOption, ElPagination, ElSelect, ElTag, ElTable, ElTableColumn,
  ElLoadingDirective as vLoading } from 'element-plus'
import { useRouter } from 'vue-router'
import { executionTaskApi } from '../api/executionTasks'
import { buildAiExecutionPrompt, summarizeAiTask } from '../utils/aiHandoff'
import { aiContinuationState, buildAiContinuationPrompt } from '../utils/aiResume'
import { aiAttention } from '../utils/aiAttention'
import { aiAttemptAudit, buildAiDiagnosticSummary } from '../utils/aiAudit'
import { chatGptAuditCsv } from '../utils/aiAuditExport'
import { createLatestRequest } from '../utils/latestRequest'

const router = useRouter()
const auditTaskStatuses = ['PENDING', 'RUNNING', 'WAITING_HUMAN',
  'RECOVERY_REQUIRED', 'COMPLETED', 'FAILED', 'CANCELLED']
const auditFilters = reactive({ keyword: '', status: '', result: '', recoveredOnly: false })
const auditApplied = ref({ keyword: '', status: '', result: '', recoveredOnly: false })
const auditRows = ref([])
const auditTotal = ref(0)
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditLoading = ref(false)
const auditExporting = ref(false)
const auditError = ref('')
const auditDirty = computed(() => JSON.stringify(appliedAuditQuery()) !==
  JSON.stringify(auditApplied.value))
let auditRequestSeq = 0
const queue = ref([])
const queueGate = createLatestRequest()
const trackingGate = createLatestRequest()
const loading = ref(false)
const errorMessage = ref('')
const promptDialog = ref(false)
const promptText = ref('')
const promptTitle = ref('交给 ChatGPT 执行')
const trackedTaskId = ref('')
const trackedDetail = ref(null)
const trackedAttention = computed(() => aiAttention(trackedDetail.value))
const aiAuditAttempts = computed(() => aiAttemptAudit(trackedDetail.value))
const trackingLoading = ref(false)
const trackingError = ref('')
let trackingInterval = null
watch(trackedTaskId, value => {
  // Synchronous invalidation also protects the A→B→A case: a delayed
  // response for the first A must never replace the latest A refresh.
  trackingGate.invalidate()
  trackingLoading.value = false
  trackingError.value = ''
  if (trackedDetail.value && String(trackedDetail.value.task?.id) !== String(value ?? '').trim()) {
    trackedDetail.value = null
  }
}, { flush: 'sync' })
function stateTag(status) {
  return ({ COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'info',
    RECOVERY_REQUIRED: 'warning', WAITING_HUMAN: 'warning' })[status] || 'info'
}
function trackTask(id) {
  trackedTaskId.value = String(id)
  loadTrackedStatus()
}
async function loadTrackedStatus() {
  const current = String(trackedTaskId.value ?? '').trim()
  const token = trackingGate.begin()
  if (!/^[1-9]\d{0,14}$/.test(current) || !Number.isSafeInteger(Number(current))) {
    trackedDetail.value = null
    trackingError.value = '请输入有效的正整数任务 ID'
    trackingLoading.value = false
    return
  }
  trackingLoading.value = true
  trackingError.value = ''
  try {
    const value = await executionTaskApi.get(Number(current))
    if (!trackingGate.isCurrent(token) || String(trackedTaskId.value ?? '').trim() !== current) return
    if (!value?.task || Number(value.task.id) !== Number(current)
        || !Array.isArray(value.executions)) {
      throw new Error('任务详情与当前任务 ID 不一致')
    }
    trackedDetail.value = value
  } catch (error) {
    if (trackingGate.isCurrent(token)) {
      trackedDetail.value = null
      trackingError.value = '查询状态失败：' + (error.message || '连接失败')
    }
  } finally {
    if (trackingGate.isCurrent(token)) trackingLoading.value = false
  }
}

function appliedAuditQuery() {
  return {
    keyword: auditFilters.keyword.trim(),
    status: auditFilters.status || '',
    result: auditFilters.result || '',
    recoveredOnly: auditFilters.recoveredOnly
  }
}
function searchAudit() {
  auditApplied.value = appliedAuditQuery()
  auditPage.value = 1
  loadAudit()
}
function resetAudit() {
  Object.assign(auditFilters, { keyword: '', status: '', result: '', recoveredOnly: false })
  searchAudit()
}
function auditPageChanged() {
  auditPage.value = 1
  loadAudit()
}
async function loadAudit() {
  const requestSeq = ++auditRequestSeq
  auditLoading.value = true
  auditError.value = ''
  try {
    const result = await executionTaskApi.chatGptAudit({
      ...auditApplied.value, pageNum: auditPage.value, pageSize: auditPageSize.value
    })
    if (requestSeq !== auditRequestSeq) return
    if (!Array.isArray(result?.list) || !Number.isSafeInteger(result.total) || result.total < 0) {
      throw new Error('审计查询响应格式异常')
    }
    auditRows.value = result.list
    auditTotal.value = result.total
  } catch (error) {
    if (requestSeq !== auditRequestSeq) return
    auditRows.value = []
    auditTotal.value = 0
    auditError.value = '审计查询失败：' + error.message
  } finally {
    if (requestSeq === auditRequestSeq) auditLoading.value = false
  }
}
async function exportAudit() {
  if (auditExporting.value || auditLoading.value) return
  const filters = { ...auditApplied.value }
  auditExporting.value = true
  auditError.value = ''
  try {
    // Always start from page 1 and recheck total for consistency.
    const first = await executionTaskApi.chatGptAudit({ ...filters, pageNum: 1, pageSize: 50 })
    const total = first?.total
    if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(first?.list)) {
      throw new Error('导出查询响应格式异常')
    }
    if (total > 500) throw new Error('匹配记录超过 500 条，请缩小筛选条件后导出')
    if (total < 1) throw new Error('没有符合条件的记录')
    const all = [...first.list]
    for (let page = 2; page <= Math.ceil(total / 50); page++) {
      const next = await executionTaskApi.chatGptAudit({
        ...filters, pageNum: page, pageSize: 50
      })
      if (next?.total !== total || !Array.isArray(next?.list)) {
        throw new Error('导出期间任务数据发生变化，请重新查询后导出')
      }
      all.push(...next.list)
    }
    if (all.length !== total ||
        new Set(all.map(row => row.taskId)).size !== all.length) {
      throw new Error('导出数据不完整或重复，请重试')
    }
    const csv = chatGptAuditCsv(all)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'dpm-chatgpt-audit-' +
        new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + '.csv'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
    ElMessage.success('已导出 ' + all.length + ' 条脱敏审计记录')
  } catch (error) {
    auditError.value = '导出失败：' + error.message
  } finally { auditExporting.value = false }
}
async function loadQueue() {
  const token = queueGate.begin()
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await executionTaskApi.chatGptQueue(20)
    if (!queueGate.isCurrent(token)) return
    if (!Array.isArray(response)) throw new Error('队列响应格式异常')
    queue.value = response
  } catch (error) {
    if (!queueGate.isCurrent(token)) return
    queue.value = []
    errorMessage.value = '无法加载 ChatGPT 待执行队列：' + (error.message || '连接失败')
  } finally {
    if (queueGate.isCurrent(token)) loading.value = false
  }
}
function previewTask(item) {
  try {
    promptText.value = buildAiExecutionPrompt(item)
    promptTitle.value = '交给 ChatGPT 执行'
    promptDialog.value = true
    trackTask(item.task.id)
  } catch (error) {
    ElMessage.warning(error.message)
    loadQueue()
  }
}
function previewContinuation() {
  try {
    const mode = aiContinuationState(trackedDetail.value)?.mode
    promptText.value = buildAiContinuationPrompt(trackedDetail.value)
    promptTitle.value = mode === 'MANUAL_RECOVERY' ? '人工恢复指引' : 'ChatGPT 断点续执行'
    promptDialog.value = true
  } catch (error) {
    ElMessage.warning(error.message)
    loadTrackedStatus()
  }
}
function goToExecutionTasks() {
  router.push('/execution-tasks')
}
async function copyDiagnostic() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板访问')
    await navigator.clipboard.writeText(buildAiDiagnosticSummary(trackedDetail.value))
    ElMessage.success('已复制不含快照、检查点正文与原始事件内容的诊断摘要')
  } catch (error) {
    ElMessage.error('复制诊断摘要失败：' + error.message)
  }
}
async function copyPrompt() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板访问')
    await navigator.clipboard.writeText(promptText.value)
    ElMessage.success('指令已复制；请粘贴到具备本地连接能力的 ChatGPT 会话中')
  } catch {
    ElMessage.error('复制失败，请手动选择并复制文本框中的内容')
  }
}
onMounted(() => {
  loadQueue()
  loadAudit()
  trackingInterval = window.setInterval(() => {
    if (trackedTaskId.value.trim()) loadTrackedStatus()
  }, 10000)
})
onUnmounted(() => {
  if (trackingInterval !== null) window.clearInterval(trackingInterval)
  queueGate.invalidate()
  trackingGate.invalidate()
  auditRequestSeq++
})
</script>

<style scoped>
.queue-card { margin-top: 16px; }
.queue-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.queue-heading strong { font-size: 15px; }
.queue-heading span, .secondary-cell, .prompt-explain { color: #78879a; font-size: 12px; }
.primary-cell { font-weight: 600; }
.queue-error { padding: 10px; margin-bottom: 12px; border-radius: 8px; background: #fff8e9; color: #9c5813; }
.prompt-explain { line-height: 1.6; margin-bottom: 12px; }
.tracking-toolbar { display: flex; align-items: center; gap: 10px; max-width: 420px; margin-bottom: 12px; }
.tracking-alert { margin-bottom: 12px; }
.tracking-content { border-radius: 8px; background: #fafbfd; padding: 12px; font-size: 12px; }
.tracking-content > div:first-child { display: flex; align-items: center; gap: 10px; }
.tracking-content p { color: #65758c; }
.tracking-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }
.tracking-actions span { color: #65758c; }
.tracking-event { padding-top: 6px; font-size: 12px; overflow-wrap: anywhere; }
.audit-history { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.audit-attempt { padding: 10px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); }
.audit-attempt-header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.audit-attempt p { margin: 6px 0; }
.audit-search { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px; }
.audit-search .el-input { width:260px; max-width:100%; }
.audit-search .el-select { width:170px; }
.audit-search .el-checkbox { margin-right:8px; }
.audit-pagination { display:flex; justify-content:flex-end; margin-top:12px; }
@media(max-width:700px) { .audit-search .el-input, .audit-search .el-select { width:100%; } }
</style>
