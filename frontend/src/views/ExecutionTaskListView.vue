<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">EXECUTION CENTER</div>
        <h1>执行任务</h1>
        <p>统一跟踪整轮与单用例执行，保留每次尝试、事件、检查点和人工介入记录。</p>
      </div>
      <el-button @click="loadData">刷新</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="AI 用例由 ChatGPT 从待执行队列获取不可变快照，按步骤记录事件与检查点并提交结果；需要登录、授权或人工确认时转入等待人工。HTTP/NODE 固定脚本由独立 Runner 自动执行。" />

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-select v-model="filters.status" class="filter-status" clearable placeholder="全部任务状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input v-model="filters.cycleId" class="filter-status" clearable placeholder="测试轮次 ID" />
        <el-input v-model="filters.keyword" class="filter-keyword" clearable
          placeholder="搜索任务编号、轮次名称、代码版本" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>执行任务列表</strong><span class="muted-count">共 {{ total }} 条</span></div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="任务编号" min-width="220">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.taskNo }}</div>
            <div class="secondary-cell">{{ row.taskType === 'EXECUTE_CYCLE' ? '整轮任务' : '单用例任务' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="测试轮次 / 环境" min-width="210">
          <template #default="{ row }">
            <div>{{ row.cycleName }}</div>
            <div class="secondary-cell">{{ row.environmentName }} ({{ row.environmentCode }})</div>
          </template>
        </el-table-column>
        <el-table-column label="代码版本" min-width="150">
          <template #default="{ row }">{{ row.codeVersion || '—' }}</template>
        </el-table-column>
        <el-table-column label="执行进度" min-width="180">
          <template #default="{ row }">
            <div>{{ row.completedCount || 0 }} / {{ row.caseCount || 0 }} 已结束</div>
            <el-progress :percentage="progress(row)" :stroke-width="6" :show-text="false" />
          </template>
        </el-table-column>
        <el-table-column label="结果" min-width="160">
          <template #default="{ row }">
            <div class="result-counts">
              <span class="pass-count">通过 {{ row.passCount || 0 }}</span>
              <span class="fail-count">失败 {{ row.failCount || 0 }}</span>
              <span class="blocked-count">阻塞 {{ row.blockedCount || 0 }}</span>
              <span class="skipped-count">跳过 {{ row.skippedCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="125">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag(row.taskStatus)">{{ statusLabel(row.taskStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="155">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="isActive(row.taskStatus)" link type="danger" @click="cancelTask(row)">取消</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无执行任务，请从已开始的测试轮次创建任务" /></template>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="detailDialog" title="执行任务详情" width="1120px" top="3vh" destroy-on-close>
      <template v-if="detail?.task">
        <div class="task-detail-heading">
          <div>
            <strong>{{ detail.task.taskNo }}</strong>
            <div class="secondary-cell">{{ detail.task.projectName }} / {{ detail.task.versionNo }} · {{ detail.task.cycleName }}</div>
          </div>
          <el-tag :type="statusTag(detail.task.taskStatus)">{{ statusLabel(detail.task.taskStatus) }}</el-tag>
        </div>
        <div class="task-detail-grid">
          <div><label>环境</label><strong>{{ detail.task.environmentName }} ({{ detail.task.environmentCode }})</strong></div>
          <div><label>代码版本</label><strong>{{ detail.task.codeVersion || '—' }}</strong></div>
          <div><label>任务类型</label><strong>{{ detail.task.taskType === 'EXECUTE_CYCLE' ? '整轮执行' : '单用例执行' }}</strong></div>
          <div><label>发起人</label><strong>{{ detail.task.requestedBy || '—' }}</strong></div>
          <div><label>执行人</label><strong>{{ detail.task.executor || '—' }}</strong></div>
          <div><label>开始时间</label><strong>{{ formatDate(detail.task.startedAt) }}</strong></div>
          <div><label>结束时间</label><strong>{{ formatDate(detail.task.completedAt) }}</strong></div>
          <div><label>异常信息</label><strong>{{ detail.task.errorMessage || '—' }}</strong></div>
        </div>

        <div v-if="detail.children?.length" class="detail-section-heading">
          <strong>用例子任务（{{ detail.children.length }}）</strong>
        </div>
        <el-table v-if="detail.children?.length" :data="detail.children" row-key="id" stripe>
          <el-table-column type="expand">
            <template #default="{ row }">
              <execution-attempts :task="row" @start="startExecution" @complete="openComplete"
                @human="handleHuman" @upload="uploadAttachment" @download="downloadAttachment" />
            </template>
          </el-table-column>
          <el-table-column label="用例" min-width="240">
            <template #default="{ row }">
              <div class="primary-cell">{{ row.caseNo || ('轮次用例 #' + row.cycleCaseId) }}</div>
              <div class="secondary-cell">{{ row.caseTitle || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="执行任务" min-width="190">
            <template #default="{ row }">{{ row.taskNo }}</template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }"><el-tag size="small" :type="statusTag(row.taskStatus)">{{ statusLabel(row.taskStatus) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="最近尝试" width="110">
            <template #default="{ row }">{{ row.executions?.[0] ? 'Attempt ' + row.executions[0].attemptNo : '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="190">
            <template #default="{ row }">
              <el-button v-if="isActive(row.taskStatus)" link type="danger" @click="cancelTask(row)">取消</el-button>
              <el-button v-if="row.taskStatus === 'RECOVERY_REQUIRED'" link type="warning" @click="resumeTask(row)">恢复</el-button>
              <el-button v-if="row.taskStatus === 'WAITING_HUMAN'" link type="success" @click="handleHuman(row.id, 'CONFIRMED')">确认继续</el-button>
              <el-button v-if="row.taskStatus === 'WAITING_HUMAN'" link type="danger" @click="handleHuman(row.id, 'REJECTED')">拒绝</el-button>
            </template>
          </el-table-column>
        </el-table>

        <template v-else>
          <div class="detail-section-heading"><strong>执行尝试</strong></div>
          <execution-attempts :task="detail.taskWithExecutions" @start="startExecution"
            @complete="openComplete" @human="handleHuman"
            @upload="uploadAttachment" @download="downloadAttachment" />
        </template>
      </template>
      <template #footer>
        <el-button v-if="detail?.task?.taskStatus === 'RECOVERY_REQUIRED'"
          type="warning" @click="resumeTask(detail.task)">恢复执行</el-button>
        <el-button v-if="detail?.task && isActive(detail.task.taskStatus)"
          type="danger" plain @click="cancelTask(detail.task)">取消任务</el-button>
        <el-button @click="detailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="completeDialog" title="登记执行结果" width="620px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="执行结果">
          <el-select v-model="completeForm.result" style="width:100%">
            <el-option v-for="item in resultOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="实际结果">
          <el-input v-model="completeForm.actualResult" type="textarea" :rows="3" placeholder="记录实际观察到的结果" />
        </el-form-item>
        <el-form-item label="执行日志">
          <el-input v-model="completeForm.logExcerpt" type="textarea" :rows="3" placeholder="可选，敏感信息会在后端脱敏" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitComplete">提交结果</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { defineComponent, h, onMounted, reactive, ref } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElProgress, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem, ElLoadingDirective as vLoading } from 'element-plus'
import { executionTaskApi } from '../api/executionTasks'

const statusOptions = [
  { value: 'PENDING', label: '待执行' }, { value: 'RUNNING', label: '执行中' },
  { value: 'WAITING_HUMAN', label: '等待人工' }, { value: 'RECOVERY_REQUIRED', label: '待恢复' },
  { value: 'COMPLETED', label: '已结束' }, { value: 'FAILED', label: '引擎失败' },
  { value: 'CANCELLED', label: '已取消' }
]
const resultOptions = [
  { value: 'PASS', label: '通过' }, { value: 'FAIL', label: '失败' },
  { value: 'BLOCKED', label: '阻塞' }, { value: 'SKIPPED', label: '跳过' }
]
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ status: '', cycleId: '', keyword: '' })
const detailDialog = ref(false)
const detail = ref(null)
const completeDialog = ref(false)
const completeTarget = ref(null)
const completeForm = reactive({ result: 'PASS', actualResult: '', logExcerpt: '' })

const ExecutionAttempts = defineComponent({
  name: 'ExecutionAttempts',
  props: { task: { type: Object, required: true } },
  emits: ['start', 'complete', 'human', 'upload', 'download'],
  setup(props, { emit }) {
    return () => h('div', { class: 'attempt-list' }, (props.task.executions || []).map(execution =>
      h(ElCard, { shadow: 'never', class: 'attempt-card', key: execution.id }, {
        header: () => h('div', { class: 'attempt-header' }, [
          h('strong', 'Attempt ' + execution.attemptNo + ' · ' + runnerLabel(execution.runnerType)),
          h(ElTag, { size: 'small', type: statusTag(execution.executionStatus) }, () => statusLabel(execution.executionStatus)),
          h('span', { class: 'attempt-result' }, execution.result ? resultLabel(execution.result) : '结果待登记')
        ]),
        default: () => [
          h('div', { class: 'attempt-meta' }, '开始：' + formatDate(execution.startedAt) + '　结束：' + formatDate(execution.completedAt)),
          execution.expectedResultSnapshot ? h('p', { class: 'attempt-text' }, '预期：' + execution.expectedResultSnapshot) : null,
          execution.actualResult ? h('p', { class: 'attempt-text' }, '实际：' + execution.actualResult) : null,
          execution.errorMessage ? h('p', { class: 'attempt-error' }, execution.errorMessage) : null,
          h('div', { class: 'attempt-actions' }, [
            execution.executionStatus === 'QUEUED' && ['MANUAL', 'CHATGPT'].includes(execution.runnerType)
              ? h(ElButton, { size: 'small', type: 'primary', onClick: () => emit('start', props.task, execution) },
                  () => execution.runnerType === 'CHATGPT' ? '开始 ChatGPT 执行' : '开始人工执行')
              : null,
            execution.executionStatus === 'QUEUED' && ['HTTP', 'NODE'].includes(execution.runnerType)
              ? h(ElTag, { size: 'small', type: 'info' }, () => execution.runnerType === 'HTTP' ? '等待 HTTP Runner' : '等待 Node Runner')
              : null,
            execution.executionStatus === 'QUEUED' && !['MANUAL', 'CHATGPT', 'HTTP', 'NODE'].includes(execution.runnerType)
              ? h(ElTag, { size: 'small', type: 'info' }, () => '对应 Runner 尚未部署')
              : null,
            execution.executionStatus === 'RUNNING' && execution.runnerType === 'MANUAL'
              ? h(ElButton, { size: 'small', type: 'success', onClick: () => emit('complete', props.task, execution) }, () => '登记结果')
              : null,
            execution.executionStatus === 'WAITING_HUMAN'
              ? h(ElButton, { size: 'small', type: 'success', onClick: () => emit('human', props.task.id, 'CONFIRMED') }, () => '确认继续')
              : null,
            execution.executionStatus === 'WAITING_HUMAN'
              ? h(ElButton, { size: 'small', type: 'danger', plain: true, onClick: () => emit('human', props.task.id, 'REJECTED') }, () => '拒绝')
              : null
          ]),
          h('div', { class: 'attachment-list' }, [
            h('div', { class: 'attachment-heading' }, [
              h('strong', '证据附件（' + (execution.attachments?.length || 0) + '）'),
              h(ElButton, { size: 'small', type: 'primary', plain: true,
                onClick: () => emit('upload', props.task, execution) }, () => '上传证据')
            ]),
            ...(execution.attachments || []).map(attachment =>
              h('div', { class: 'attachment-row', key: attachment.id }, [
                h('span', attachment.fileName + ' · ' + attachmentTypeLabel(attachment.attachmentType)
                  + ' · ' + formatFileSize(attachment.fileSize)),
                h(ElButton, { size: 'small', link: true, type: 'primary',
                  onClick: () => emit('download', props.task, execution, attachment) }, () => '下载')
              ])
            )
          ]),
          execution.events?.length ? h('div', { class: 'event-list' }, [
            h('strong', '执行事件'),
            h(ElTimeline, null, {
              default: () => execution.events.map(event =>
                h(ElTimelineItem, { timestamp: formatDate(event.createdAt), key: event.id }, () =>
                  h('div', [
                    h('strong', event.eventType),
                    h('p', event.eventContent || '—')
                  ])
                )
              )
            })
          ]) : null
        ]
      })
    ))
  }
})

async function loadData() {
  loading.value = true
  try {
    const result = await executionTaskApi.page({
      status: filters.status || undefined,
      cycleId: filters.cycleId ? Number(filters.cycleId) : undefined,
      keyword: filters.keyword.trim() || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) { ElMessage.error(error.message || '加载执行任务失败') }
  finally { loading.value = false }
}
function search() { pageNum.value = 1; loadData() }
function resetFilters() {
  Object.assign(filters, { status: '', cycleId: '', keyword: '' })
  search()
}
function handleSizeChange() { pageNum.value = 1; loadData() }
function progress(row) {
  return row.caseCount ? Math.round((row.completedCount || 0) * 100 / row.caseCount) : 0
}
async function openDetail(row) {
  try {
    detail.value = await executionTaskApi.get(row.id)
    if (!detail.value.children?.length) {
      detail.value.taskWithExecutions = { ...detail.value.task, executions: detail.value.executions || [] }
    }
    detailDialog.value = true
  } catch (error) { ElMessage.error(error.message || '读取执行任务失败') }
}
async function refreshDetail() {
  if (detail.value?.task?.id) await openDetail({ id: detail.value.task.id })
}
function uploadAttachment(task, execution) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.json,.csv'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const name = file.name.toLowerCase()
    const type = /\.(png|jpe?g|gif|webp)$/.test(name) ? 'SCREENSHOT'
      : /\.(txt|log)$/.test(name) ? 'LOG'
        : name.startsWith('request') ? 'REQUEST'
          : name.startsWith('response') ? 'RESPONSE' : 'OTHER'
    saving.value = true
    try {
      await executionTaskApi.uploadAttachment(task.id, execution.id, file, type)
      await refreshDetail()
      ElMessage.success('证据文件上传成功')
    } catch (error) { ElMessage.error(error.message || '证据文件上传失败') }
    finally { saving.value = false }
  }
  input.click()
}
async function downloadAttachment(task, execution, attachment) {
  try {
    const blob = await executionTaskApi.downloadAttachment(task.id, execution.id, attachment.id)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.fileName || 'evidence'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  } catch (error) { ElMessage.error(error.message || '证据文件下载失败') }
}
function attachmentTypeLabel(value) {
  return ({ SCREENSHOT: '截图', LOG: '日志', REQUEST: '请求', RESPONSE: '响应', OTHER: '其他' })[value] || value || '其他'
}
function formatFileSize(value) {
  const size = Number(value) || 0
  return size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(2) + ' MB'
    : size >= 1024 ? (size / 1024).toFixed(1) + ' KB' : size + ' B'
}
async function startExecution(task, execution) {
  saving.value = true
  try {
    await executionTaskApi.start(task.id, execution.id, {
      actor: execution.runnerType,
      executorName: execution.runnerType === 'CHATGPT' ? 'ChatGPT' : 'local-user'
    })
    await refreshDetail()
    await loadData()
    ElMessage.success(execution.runnerType === 'CHATGPT' ? '已进入 ChatGPT 执行状态' : '已开始人工执行')
  } catch (error) { ElMessage.error(error.message || '启动执行失败') }
  finally { saving.value = false }
}
function openComplete(task, execution) {
  completeTarget.value = { taskId: task.id, executionId: execution.id }
  Object.assign(completeForm, { result: 'PASS', actualResult: '', logExcerpt: '' })
  completeDialog.value = true
}
async function submitComplete() {
  if (!completeTarget.value) return
  saving.value = true
  try {
    await executionTaskApi.complete(completeTarget.value.taskId, completeTarget.value.executionId, {
      ...completeForm, executorName: 'local-user'
    })
    completeDialog.value = false
    await refreshDetail()
    await loadData()
    ElMessage.success('执行结果已登记')
  } catch (error) { ElMessage.error(error.message || '登记执行结果失败') }
  finally { saving.value = false }
}
async function handleHuman(taskId, decision) {
  try {
    const answer = await ElMessageBox.prompt(
      decision === 'REJECTED' ? '请说明拒绝原因' : '可填写人工操作结果或备注',
      decision === 'REJECTED' ? '拒绝人工介入' : '确认人工操作',
      { confirmButtonText: decision === 'REJECTED' ? '确认拒绝' : '确认继续',
        cancelButtonText: '取消', inputType: 'textarea' }
    )
    await executionTaskApi.humanIntervention(taskId, {
      decision, note: answer.value, decidedBy: 'local-user'
    })
    await refreshDetail()
    await loadData()
    ElMessage.success(decision === 'CONFIRMED' ? '已确认，任务回到待执行状态' : '已拒绝，执行结果登记为阻塞')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '人工介入处理失败')
  }
}
async function cancelTask(task) {
  try {
    const answer = await ElMessageBox.prompt('可填写取消原因', '取消执行任务', {
      confirmButtonText: '确认取消', cancelButtonText: '返回', inputType: 'textarea'
    })
    await executionTaskApi.cancel(task.id, { note: answer.value, cancelledBy: 'local-user' })
    await refreshDetail()
    await loadData()
    ElMessage.success('任务已取消')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '取消任务失败')
  }
}
async function resumeTask(task) {
  try {
    await ElMessageBox.confirm('恢复会保留旧尝试，并创建新的 attempt，不会自动重放可能产生副作用的步骤。', '恢复执行任务')
    await executionTaskApi.resume(task.id)
    await refreshDetail()
    await loadData()
    ElMessage.success('任务已恢复为待执行状态')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '恢复任务失败')
  }
}
function isActive(status) { return ['PENDING', 'RUNNING', 'WAITING_HUMAN', 'RECOVERY_REQUIRED'].includes(status) }
function statusLabel(value) { return statusOptions.find(item => item.value === value)?.label || value || '—' }
function statusTag(value) {
  return ({ PENDING: 'info', RUNNING: 'warning', WAITING_HUMAN: 'warning',
    RECOVERY_REQUIRED: 'danger', COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'info' })[value] || 'info'
}
function resultLabel(value) { return resultOptions.find(item => item.value === value)?.label || value || '—' }
function runnerLabel(value) {
  return ({ MANUAL: '人工', CHATGPT: 'ChatGPT', NODE: 'Node.js', PYTHON: 'Python', JAVA: 'Java', HTTP: 'HTTP' })[value] || value || '—'
}
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '—' }
onMounted(loadData)
</script>

<style scoped>
.skipped-count { color:#8b96a7; }
.task-detail-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.task-detail-heading strong { color:#29364c; font-size:15px; }
.task-detail-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding:14px; margin-bottom:18px; background:#f8f9fc; border:1px solid #edf0f5; border-radius:10px; }
.task-detail-grid label,.task-detail-grid strong { display:block; overflow-wrap:anywhere; }
.task-detail-grid label { margin-bottom:6px; color:#8b96a7; font-size:10px; }
.task-detail-grid strong { color:#3d4b64; font-size:11px; }
.detail-section-heading { margin:16px 0 12px; color:#34425b; font-size:13px; }
.attempt-list { display:flex; flex-direction:column; gap:10px; padding:12px 18px; background:#fafbfe; }
.attempt-card { border-radius:8px; }
.attempt-header { display:flex; align-items:center; gap:10px; }
.attempt-header strong { color:#34425b; font-size:12px; }
.attempt-result { margin-left:auto; color:#68758a; font-size:11px; }
.attempt-meta,.attempt-text { margin:5px 0; color:#68758a; font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.attempt-error { color:#c45656; font-size:11px; }
.attempt-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.attachment-list { margin-top:12px; padding:10px 12px; background:#f8f9fc; border:1px solid #edf0f5; border-radius:8px; }
.attachment-heading,.attachment-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.attachment-heading { margin-bottom:6px; color:#52617a; font-size:11px; }
.attachment-row { min-height:30px; border-top:1px solid #edf0f5; color:#68758a; font-size:11px; }
.attachment-row span { min-width:0; overflow-wrap:anywhere; }
.event-list { margin-top:14px; padding-top:12px; border-top:1px solid #edf0f5; }
.event-list > strong { display:block; margin-bottom:10px; color:#52617a; font-size:11px; }
.event-list p { margin:4px 0; color:#68758a; font-size:11px; }
@media(max-width:760px) { .task-detail-grid { grid-template-columns:1fr 1fr; } }
</style>
