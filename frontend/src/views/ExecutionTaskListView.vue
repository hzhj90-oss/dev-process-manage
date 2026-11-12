<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">EXECUTION CENTER</div>
        <h1>执行任务</h1>
        <p>统一跟踪整轮与单用例执行，保留每次尝试、事件、检查点和人工介入记录。</p>
      </div>
      <el-button @click="refreshAll">刷新</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="AI 用例由 ChatGPT 从待执行队列获取不可变快照，按步骤记录事件与检查点并提交结果；需要登录、授权或人工确认时转入等待人工。HTTP / NODE / BROWSER 固定脚本由独立 Runner 自动执行。" />

    <el-alert v-if="reviewTarget" type="info" :closable="false" show-icon
      :title="`正在复核轮次 #${reviewTarget.cycleId} 的用例执行记录（任务 #${reviewTarget.taskId}）。此操作只读取历史记录。`" class="review-link-alert" />

    <el-card shadow="never" class="runner-status-card">
      <div class="runner-monitor-heading">
        <div>
          <strong>执行器在线状态</strong>
          <span>每 10 秒自动刷新；超过 30 秒无联系视为离线</span>
        </div>
        <el-button size="small" @click="loadRunnerStatus">刷新状态</el-button>
      </div>
      <div v-if="runnerStatusError" class="runner-monitor-error" role="alert">{{ runnerStatusError }}</div>
      <div class="runner-status-grid">
        <div v-for="item in runnerSummary" :key="item.runnerType" class="runner-status-item">
          <div class="runner-status-title">
            <strong>{{ runnerTypeName(item.runnerType) }}</strong>
            <el-tag size="small" :type="item.onlineCount > 0 ? 'success' : item.knownCount > 0 ? 'danger' : 'info'">
              {{ item.onlineCount > 0 ? '在线 ' + item.onlineCount : item.knownCount > 0 ? '离线' : '未连接' }}
            </el-tag>
          </div>
          <div v-for="runner in knownRunners(item.runnerType)" :key="runner.runnerId" class="runner-status-detail">
            <span>{{ runner.runnerId }}</span>
            <span>{{ runner.online ? '在线' : '离线' }} · {{ runner.secondsSinceLastSeen }} 秒前</span>
          </div>
          <div v-if="item.knownCount === 0" class="runner-status-detail">后端启动后暂无该类型执行器上报</div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="attention-card">
      <div class="attention-heading">
        <strong>待处理事项</strong>
        <span>每 30 秒检查一次，仅提示和筛选，不会自动重试任务</span>
      </div>
      <div v-if="attentionError" class="runner-monitor-error" role="alert">{{ attentionError }}</div>
      <div class="attention-summary">
        <div v-for="item in attentionItems" :key="item.status" class="attention-item">
          <span>{{ item.label }}</span>
          <strong>{{ attentionLoading ? '—' : attentionCounts[item.status] ?? '—' }}</strong>
          <el-button size="small" link type="primary" :disabled="attentionCounts[item.status] == null"
            @click="filterByStatus(item.status)">查看任务</el-button>
        </div>
      </div>
      <el-alert v-if="!attentionLoading && (attentionCounts.RECOVERY_REQUIRED || 0) > 0"
        type="warning" :closable="false" show-icon
        title="有任务因失联进入待恢复状态。请先核对上次执行结果和业务影响，再人工确认恢复，系统不会自动重试。" />
      <el-alert v-if="!attentionLoading && (attentionCounts.WAITING_HUMAN || 0) > 0"
        type="info" :closable="false" show-icon
        title="有等待人工确认的任务，请进入任务详情处理。" />
      <el-alert v-if="offlineRunnerTypes.length" type="warning" :closable="false" show-icon
        :title="'检测到执行器离线：' + offlineRunnerTypes.map(runnerTypeName).join('、') + '。关联的自动执行任务可能持续排队。'" />
    </el-card>

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

    <el-alert v-if="listError" type="error" :closable="false" show-icon style="margin-bottom: 16px"
      :title="'执行任务列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
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
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="taskAction !== null || cancelBusyId !== null || filePickerPending" @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.taskStatus === 'RECOVERY_REQUIRED' && row.taskType === 'EXECUTE_CASE'"
              link type="warning" :disabled="taskAction !== null || cancelBusyId !== null"
                :loading="taskAction?.type === 'resume' && taskAction?.taskId === row.id"
                @click="resumeTask(row)">人工恢复</el-button>
            <el-button v-if="isActive(row.taskStatus)" link type="danger" :loading="cancelBusyId === row.id"
              :disabled="cancelBusyId !== null" @click="cancelTask(row)">取消</el-button>
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

    <el-dialog v-model="detailDialog" title="执行任务详情" width="1120px" top="3vh" destroy-on-close
      @close="invalidateTaskDetail" :close-on-click-modal="cancelBusyId === null && taskAction === null && !filePickerPending"
      :close-on-press-escape="cancelBusyId === null && taskAction === null && !filePickerPending" :show-close="cancelBusyId === null && taskAction === null && !filePickerPending">
      <el-alert v-if="taskDetailError" type="error" show-icon :closable="false"
        :title="taskDetailError" />
      <el-alert v-if="attachmentNotice" type="warning" show-icon :closable="false"
        :title="attachmentNotice" style="margin: 8px 0 12px">
        <el-button size="small" link type="primary" :disabled="taskAction !== null"
          @click="refreshDetail">重新读取附件</el-button>
      </el-alert>
      <el-button v-if="taskDetailError" type="primary" plain size="small" style="margin: 12px 0"
        @click="retryTaskDetail">重试读取任务详情</el-button>
      <div v-if="taskDetailLoading" v-loading="true" style="min-height: 130px" />
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
              <execution-attempts :task="row" :busy="taskAction || (cancelBusyId !== null ? {type: 'cancel', taskId: cancelBusyId} : null)" @start="startExecution" @complete="openComplete"
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
              <el-button v-if="isActive(row.taskStatus)" link type="danger" :loading="cancelBusyId === row.id"
              :disabled="cancelBusyId !== null" @click="cancelTask(row)">取消</el-button>
              <el-button v-if="row.taskStatus === 'RECOVERY_REQUIRED'" link type="warning" :loading="taskAction?.type === 'resume' && taskAction?.taskId === row.id"
                :disabled="taskAction !== null || cancelBusyId !== null" @click="resumeTask(row)">恢复</el-button>
              <el-button v-if="row.taskStatus === 'WAITING_HUMAN'" link type="success" :disabled="taskAction !== null || cancelBusyId !== null"
                @click="handleHuman(row.id, 'CONFIRMED')">确认继续</el-button>
              <el-button v-if="row.taskStatus === 'WAITING_HUMAN'" link type="danger" :disabled="taskAction !== null || cancelBusyId !== null"
                @click="handleHuman(row.id, 'REJECTED')">拒绝</el-button>
            </template>
          </el-table-column>
        </el-table>

        <template v-else>
          <div class="detail-section-heading"><strong>执行尝试</strong></div>
          <execution-attempts :task="detail.taskWithExecutions" :busy="taskAction || (cancelBusyId !== null ? {type: 'cancel', taskId: cancelBusyId} : null)" @start="startExecution"
            @complete="openComplete" @human="handleHuman"
            @upload="uploadAttachment" @download="downloadAttachment" />
        </template>
      </template>
      <template #footer>
        <el-button v-if="detail?.task?.taskStatus === 'RECOVERY_REQUIRED'"
          type="warning" :loading="taskAction?.type === 'resume' && taskAction?.taskId === detail.task.id"
          :disabled="taskAction !== null || cancelBusyId !== null" @click="resumeTask(detail.task)">恢复执行</el-button>
        <el-button v-if="detail?.task && isActive(detail.task.taskStatus)"
          type="danger" plain :loading="cancelBusyId === detail.task.id"
          :disabled="cancelBusyId !== null || taskAction !== null" @click="cancelTask(detail.task)">取消任务</el-button>
        <el-button :disabled="cancelBusyId !== null || taskAction !== null || filePickerPending" @click="detailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="completeDialog" title="登记执行结果" width="620px" destroy-on-close
      :close-on-click-modal="taskAction === null" :close-on-press-escape="taskAction === null"
      :show-close="taskAction === null">
      <el-form label-width="100px" :disabled="taskAction !== null">
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
        <el-button :disabled="taskAction !== null" @click="completeDialog = false">取消</el-button>
        <el-button type="primary" :loading="taskAction?.type === 'complete'"
          :disabled="taskAction !== null" @click="submitComplete">提交结果</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElProgress, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem, ElLoadingDirective as vLoading } from 'element-plus'
import { executionTaskApi } from '../api/executionTasks'
import { runnerApi } from '../api/runners'
import { matchesReviewTask, readReviewTarget } from '../utils/reportReview'
import { createLatestRequest } from '../utils/latestRequest'
import { validateEvidenceFile, currentEvidence, attachmentByDigest, sha256Evidence } from '../utils/attachmentSafety'
const route = useRoute()
const listGate = createLatestRequest()
const listError = ref('')
const taskDetailGate = createLatestRequest()
const taskDetailLoading = ref(false)
const taskDetailError = ref('')
const taskDetailRequestedId = ref(null)
const reviewTarget = computed(() => readReviewTarget(route.query))

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
const runnerSummary = ref(['HTTP', 'NODE', 'BROWSER'].map(runnerType => ({
  runnerType, onlineCount: 0, knownCount: 0
})))
const runnerInstances = ref([])
const runnerStatusError = ref('')
let runnerMonitorTimer = null
let attentionTimer = null
const attentionLoading = ref(true)
const attentionError = ref('')
const attentionCounts = ref({ PENDING: null, WAITING_HUMAN: null, RECOVERY_REQUIRED: null })
const attentionItems = [
  { status: 'PENDING', label: '待执行' },
  { status: 'WAITING_HUMAN', label: '待人工处理' },
  { status: 'RECOVERY_REQUIRED', label: '待恢复' }
]
const offlineRunnerTypes = computed(() => runnerSummary.value
  .filter(item => item.knownCount > 0 && item.onlineCount === 0)
  .map(item => item.runnerType))
async function loadAttention() {
  const requests = attentionItems.map(item =>
    executionTaskApi.page({ status: item.status, pageNum: 1, pageSize: 1 }))
  const results = await Promise.allSettled(requests)
  const next = {}
  for (let i = 0; i < attentionItems.length; i++) {
    const result = results[i]
    const value = result.status === 'fulfilled' ? result.value?.total : null
    next[attentionItems[i].status] = Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  attentionCounts.value = next
  attentionLoading.value = false
  attentionError.value = Object.values(next).some(value => value == null)
    ? '部分待处理数量暂时无法获取，未加载的数据不会显示为 0。' : ''
}
function filterByStatus(status) {
  Object.assign(filters, { status, cycleId: '', keyword: '' })
  pageNum.value = 1
  loadData()
}


async function loadRunnerStatus() {
  try {
    const value = await runnerApi.status()
    runnerSummary.value = value.summary || []
    runnerInstances.value = value.runners || []
    runnerStatusError.value = ''
  } catch (error) {
    runnerSummary.value = []
    runnerInstances.value = []
    runnerStatusError.value = '无法获取 Runner 在线状态：' + (error.message || '连接失败')
  }
}
function knownRunners(runnerType) {
  return runnerInstances.value.filter(item => item.runnerType === runnerType)
}
function runnerOnline(runnerType) {
  return runnerSummary.value.some(item => item.runnerType === runnerType && item.onlineCount > 0)
}
function runnerTypeName(type) {
  return ({ HTTP: 'HTTP Runner', NODE: 'Node Runner', BROWSER: 'Browser Runner' })[type] || type
}
async function refreshAll() {
  await Promise.all([loadData(), loadRunnerStatus(), loadAttention()])
}
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
// Serialize cancellation confirmation + state recheck + mutation.
const cancelBusyId = ref(null)
// One exclusive mutation across all task actions, including confirmation prompts.
const taskAction = shallowRef(null)
// Native file picker is not an async task action; unlock on change or cancel.
const filePickerPending = ref(false)
const downloadingAttachments = ref(new Set())
const attachmentNotice = ref('')
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
  props: { task: { type: Object, required: true }, busy: { type: Object, default: null } },
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
              ? h(ElButton, { size: 'small', type: 'primary',
                  disabled: !!props.busy, loading: props.busy?.type === 'start' && props.busy?.executionId === execution.id,
                  onClick: () => emit('start', props.task, execution) },
                  () => execution.runnerType === 'CHATGPT' ? '开始 ChatGPT 执行' : '开始人工执行')
              : null,
            execution.executionStatus === 'QUEUED' && ['HTTP', 'NODE', 'BROWSER'].includes(execution.runnerType)
              ? h(ElTag, { size: 'small', type: runnerOnline(execution.runnerType) ? 'info' : 'warning' },
                  () => runnerOnline(execution.runnerType)
                    ? '等待 ' + runnerTypeName(execution.runnerType) + ' 领取'
                    : runnerTypeName(execution.runnerType) + ' 未连接，请检查执行器')
              : null,
            execution.executionStatus === 'QUEUED' && !['MANUAL', 'CHATGPT', 'HTTP', 'NODE', 'BROWSER'].includes(execution.runnerType)
              ? h(ElTag, { size: 'small', type: 'info' }, () => '对应 Runner 尚未部署')
              : null,
            execution.executionStatus === 'RUNNING' && execution.runnerType === 'MANUAL'
              ? h(ElButton, { size: 'small', type: 'success', disabled: !!props.busy,
                  onClick: () => emit('complete', props.task, execution) }, () => '登记结果')
              : null,
            execution.executionStatus === 'WAITING_HUMAN'
              ? h(ElButton, { size: 'small', type: 'success', disabled: !!props.busy,
                  onClick: () => emit('human', props.task.id, 'CONFIRMED') }, () => '确认继续')
              : null,
            execution.executionStatus === 'WAITING_HUMAN'
              ? h(ElButton, { size: 'small', type: 'danger', plain: true, disabled: !!props.busy,
                  onClick: () => emit('human', props.task.id, 'REJECTED') }, () => '拒绝')
              : null
          ]),
          h('div', { class: 'attachment-list' }, [
            h('div', { class: 'attachment-heading' }, [
              h('strong', '证据附件（' + (execution.attachments?.length || 0) + '）'),
              h(ElButton, { size: 'small', type: 'primary', plain: true,
                disabled: !!props.busy || filePickerPending.value,
                loading: props.busy?.type === 'upload' && props.busy?.executionId === execution.id,
                onClick: () => emit('upload', props.task, execution) }, () => '上传证据')
            ]),
            ...(execution.attachments || []).map(attachment =>
              h('div', { class: 'attachment-row', key: attachment.id }, [
                h('span', attachment.fileName + ' · ' + attachmentTypeLabel(attachment.attachmentType)
                  + ' · ' + formatFileSize(attachment.fileSize)),
                h(ElButton, { size: 'small', link: true, type: 'primary',
                  disabled: !!props.busy || downloadingAttachments.value.has(attachmentDownloadKey(props.task.id, execution.id, attachment.id)),
                  loading: downloadingAttachments.value.has(attachmentDownloadKey(props.task.id, execution.id, attachment.id)),
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

let reviewNavigationSequence = 0
async function navigateFromReport() {
  const target = readReviewTarget(route.query)
  if (!target) return false
  const request = ++reviewNavigationSequence
  const detailToken = taskDetailGate.begin()
  taskDetailRequestedId.value = target.taskId
  taskDetailError.value = ''
  Object.assign(filters, { status: '', cycleId: String(target.cycleId), keyword: '' })
  pageNum.value = 1
  await loadData()
  try {
    const next = await executionTaskApi.get(target.taskId)
    if (request !== reviewNavigationSequence || !taskDetailGate.isCurrent(detailToken)) return true
    // Validate that the looked-up task still belongs to the requested
    // cycle and case; a URL is never sufficient to trust the association.
    if (!matchesReviewTask(next?.task, target)) {
      detailDialog.value = false
      ElMessage.warning('执行任务不属于所选轮次用例，已拒绝自动定位')
      return true
    }
    if (!next.children?.length) {
      next.taskWithExecutions = { ...next.task, executions: next.executions || [] }
    }
    detail.value = next
    detailDialog.value = true
  } catch (error) {
    if (request === reviewNavigationSequence && taskDetailGate.isCurrent(detailToken)) {
      detailDialog.value = false
      ElMessage.error(error.message || '无法读取需要复核的执行任务')
    }
  }
  return true
}
watch(() => [route.query.cycleId, route.query.taskId, route.query.cycleCaseId], () => {
  if (reviewTarget.value) navigateFromReport()
  else {
    reviewNavigationSequence++
    detailDialog.value = false
    Object.assign(filters, { status: '', cycleId: '', keyword: '' })
    pageNum.value = 1
    loadData()
  }
})

async function loadData() {
  const token = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await executionTaskApi.page({
      status: filters.status || undefined,
      cycleId: filters.cycleId ? Number(filters.cycleId) : undefined,
      keyword: filters.keyword.trim() || undefined,
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
    listError.value = error.message || '加载执行任务失败，请重试'
  } finally {
    if (listGate.isCurrent(token)) loading.value = false
  }
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
function invalidateTaskDetail() {
  attachmentNotice.value = ''
  taskDetailGate.invalidate()
  taskDetailLoading.value = false
}
function retryTaskDetail() {
  if (taskDetailRequestedId.value) openDetail({ id: taskDetailRequestedId.value })
}
async function openDetail(row) {
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = taskDetailGate.begin()
  taskDetailRequestedId.value = id
  taskDetailError.value = ''
  taskDetailLoading.value = true
  detail.value = null
  detailDialog.value = true
  try {
    const next = await executionTaskApi.get(id)
    if (!taskDetailGate.isCurrent(token) || !detailDialog.value) return
    if (!next?.task || Number(next.task.id) !== id) {
      throw new Error('任务详情与当前选择不一致，请重新加载')
    }
    if (!next.children?.length) {
      next.taskWithExecutions = { ...next.task, executions: next.executions || [] }
    }
    detail.value = next
  } catch (error) {
    if (taskDetailGate.isCurrent(token) && detailDialog.value) {
      taskDetailError.value = error.message || '读取执行任务失败'
    }
  } finally {
    if (taskDetailGate.isCurrent(token)) taskDetailLoading.value = false
  }
}
async function refreshDetail() {
  if (detail.value?.task?.id) await openDetail({ id: detail.value.task.id })
}
function attachmentDownloadKey(taskId, executionId, attachmentId) {
  return taskId + ':' + executionId + ':' + attachmentId
}
function displayedEvidence(taskId, executionId) {
  if (!detailDialog.value || !detail.value) return null
  return currentEvidence(detail.value, taskId, executionId)
}
function uploadAttachment(task, execution) {
  const taskId = Number(task?.id)
  const executionId = Number(execution?.id)
  if (taskAction.value || cancelBusyId.value !== null || filePickerPending.value
      || !Number.isSafeInteger(taskId) || taskId <= 0
      || !Number.isSafeInteger(executionId) || executionId <= 0
      || !displayedEvidence(taskId, executionId)) return
  filePickerPending.value = true
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.json,.csv'
  const finishPicker = () => { filePickerPending.value = false }
  input.oncancel = finishPicker
  input.onchange = () => {
    finishPicker()
    const file = input.files?.[0]
    if (!file || !displayedEvidence(taskId, executionId)) return
    // Claim immediately after file selection, before hashing or another GET.
    const token = claimTaskAction('upload', taskId, executionId)
    if (!token) return
    void commitEvidenceUpload(token, file)
  }
  try { input.click() } catch (error) {
    finishPicker()
    ElMessage.error(error.message || '无法打开文件选择框')
  }
}
async function commitEvidenceUpload(token, file) {
  let uploaded = false
  let postAttempted = false
  let originalAttachmentIds = []
  let digest = ''
  let chosen
  try {
    chosen = validateEvidenceFile(file)
    digest = await sha256Evidence(file)
    const latest = await latestTaskForAction(token.taskId)
    const execution = currentEvidence(latest, token.taskId, token.executionId)
    if (!execution) {
      throw new Error('执行尝试已变化或不属于原任务，未上传附件')
    }
    // Freeze IDs from the pre-upload response. A lost response can be checked
    // against newly-added metadata, never by guessing from the file name alone.
    originalAttachmentIds = (execution.attachments || []).map(item => ({ id: item.id }))
    if (!displayedEvidence(token.taskId, token.executionId)) {
      throw new Error('当前任务详情已切换，已停止上传')
    }
    postAttempted = true
    const response = await executionTaskApi.uploadAttachment(
      token.taskId, token.executionId, file, chosen.type)
    if (Number(response?.executionId) !== token.executionId
        || Number(response?.fileSize) !== file.size
        || response.sha256 !== digest
        || response.attachmentType !== chosen.type
        || !Number.isSafeInteger(Number(response?.id)) || Number(response.id) <= 0) {
      throw new Error('附件返回信息与本次上传不一致')
    }
    uploaded = true
  } catch (error) {
    if (postAttempted && digest && chosen) {
      try {
        const latest = await latestTaskForAction(token.taskId)
        const current = currentEvidence(latest, token.taskId, token.executionId)
        const confirmed = attachmentByDigest(originalAttachmentIds,
          current?.attachments, digest, file.size, chosen.type)
        if (confirmed) uploaded = true
      } catch (_) { /* The upload result is still ambiguous, not a safe retry. */ }
    }
    if (!uploaded) {
      const text = (error.message || '证据文件上传失败')
        + (postAttempted
          ? '；结果可能已保存，请检查该执行尝试的附件列表，确认后再决定是否重传。'
          : '；没有发出上传请求。')
      attachmentNotice.value = text
      ElMessage.error(text)
    }
  } finally {
    try {
      if (detailDialog.value) {
        const rootId = Number(detail.value?.task?.id)
        if (Number.isSafeInteger(rootId) && rootId > 0) await openDetail({ id: rootId })
      }
    } catch (_) { /* Preserve the upload notice when refresh failed. */ }
    if (uploaded) {
      attachmentNotice.value = ''
      ElMessage.success('证据文件已保存并核对，已更新附件列表')
    }
    releaseTaskAction(token)
  }
}
async function downloadAttachment(task, execution, attachment) {
  const taskId = Number(task?.id)
  const executionId = Number(execution?.id)
  const attachmentId = Number(attachment?.id)
  if (![taskId, executionId, attachmentId].every(id => Number.isSafeInteger(id) && id > 0)
      || taskAction.value || cancelBusyId.value !== null) return
  const current = displayedEvidence(taskId, executionId)
  if (!current?.attachments?.some(item => Number(item.id) === attachmentId)) return
  const key = attachmentDownloadKey(taskId, executionId, attachmentId)
  if (downloadingAttachments.value.has(key)) return
  downloadingAttachments.value.add(key)
  try {
    const blob = await executionTaskApi.downloadAttachment(taskId, executionId, attachmentId)
    // An async download must not act on a different task opened meanwhile.
    if (!displayedEvidence(taskId, executionId) || !detailDialog.value) return
    if (!(blob instanceof Blob)) throw new Error('附件下载响应格式不正确')
    if (Number.isSafeInteger(Number(attachment.fileSize)) && Number(attachment.fileSize) > 0
        && blob.size !== Number(attachment.fileSize)) throw new Error('附件下载大小与记录不一致，已阻止保存')
    const url = window.URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.fileName || 'evidence'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
    }
  } catch (error) { ElMessage.error(error.message || '证据文件下载失败') }
  finally { downloadingAttachments.value.delete(key) }
}
function attachmentTypeLabel(value) {
  return ({ SCREENSHOT: '截图', LOG: '日志', REQUEST: '请求', RESPONSE: '响应', OTHER: '其他' })[value] || value || '其他'
}
function formatFileSize(value) {
  const size = Number(value) || 0
  return size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(2) + ' MB'
    : size >= 1024 ? (size / 1024).toFixed(1) + ' KB' : size + ' B'
}
// One exclusive action is claimed before any asynchronous validation or prompt.
function claimTaskAction(type, taskId, executionId = null) {
  const id = Number(taskId)
  if (taskAction.value || cancelBusyId.value !== null || filePickerPending.value || saving.value
      || !Number.isSafeInteger(id) || id <= 0) return null
  const token = { type, taskId: id, executionId }
  taskAction.value = token
  return token
}
function releaseTaskAction(token) {
  if (taskAction.value === token) taskAction.value = null
}
async function latestTaskForAction(id) {
  const latest = await executionTaskApi.get(id)
  if (Number(latest?.task?.id) !== id || !Array.isArray(latest.executions)) {
    throw new Error('任务详情与当前操作目标不一致，已拒绝提交')
  }
  return latest
}
function matchingExecution(latest, executionId, status, runner = null) {
  return latest.executions.some(item => Number(item.id) === executionId
    && item.executionStatus === status && (!runner || item.runnerType === runner))
}
async function reconcileTaskAction(id) {
  // A transport error may mean the server already committed the mutation.
  // Refresh the selected parent/child and the list; never auto-retry the POST.
  const detailId = Number(detail.value?.task?.id)
  if (detailDialog.value && Number.isSafeInteger(detailId) && detailId > 0) {
    await openDetail({ id: detailId })
  }
  await Promise.all([loadData(), loadAttention()])
}
function taskActionFailure(error, label) {
  ElMessage.error((error?.message || label) + '；正在核对服务端状态，请勿直接重复提交')
}
async function startExecution(task, execution) {
  const executionId = Number(execution?.id)
  const runner = execution?.runnerType
  if (!Number.isSafeInteger(executionId) || executionId <= 0
      || !['MANUAL', 'CHATGPT'].includes(runner)
      || execution?.executionStatus !== 'QUEUED'
      || task?.taskStatus !== 'PENDING') return
  const token = claimTaskAction('start', task?.id, executionId)
  if (!token) return
  try {
    const latest = await latestTaskForAction(token.taskId)
    if (latest.task.taskType !== 'EXECUTE_CASE'
        || latest.task.taskStatus !== 'PENDING'
        || !matchingExecution(latest, executionId, 'QUEUED', runner)) {
      ElMessage.warning('任务已不是待执行状态，未发送开始请求')
      await reconcileTaskAction(token.taskId)
      return
    }
    const updated = await executionTaskApi.start(token.taskId, executionId, {
      actor: runner, executorName: runner === 'CHATGPT' ? 'ChatGPT' : 'local-user'
    })
    if (Number(updated?.task?.id) !== token.taskId || updated.task.taskStatus !== 'RUNNING') {
      throw new Error('开始执行响应与操作目标不匹配')
    }
    await reconcileTaskAction(token.taskId)
    ElMessage.success(runner === 'CHATGPT' ? '已进入 ChatGPT 执行状态' : '已开始人工执行')
  } catch (error) {
    taskActionFailure(error, '启动执行失败')
    await reconcileTaskAction(token.taskId)
  } finally {
    releaseTaskAction(token)
  }
}
function openComplete(task, execution) {
  if (taskAction.value || cancelBusyId.value !== null
      || task?.taskStatus !== 'RUNNING' || execution?.executionStatus !== 'RUNNING'
      || execution?.runnerType !== 'MANUAL') return
  const taskId = Number(task?.id)
  const executionId = Number(execution?.id)
  if (!Number.isSafeInteger(taskId) || taskId <= 0
      || !Number.isSafeInteger(executionId) || executionId <= 0) return
  completeTarget.value = { taskId, executionId }
  Object.assign(completeForm, { result: 'PASS', actualResult: '', logExcerpt: '' })
  completeDialog.value = true
}
async function submitComplete() {
  if (!completeDialog.value || !completeTarget.value
      || !resultOptions.some(item => item.value === completeForm.result)) return
  const target = { ...completeTarget.value }
  const token = claimTaskAction('complete', target.taskId, target.executionId)
  if (!token) return
  const request = { ...completeForm, executorName: 'local-user' }
  try {
    const latest = await latestTaskForAction(token.taskId)
    if (latest.task.taskType !== 'EXECUTE_CASE'
        || latest.task.taskStatus !== 'RUNNING'
        || !matchingExecution(latest, token.executionId, 'RUNNING', 'MANUAL')) {
      ElMessage.warning('执行状态已变化，未登记重复结果')
      completeDialog.value = false
      await reconcileTaskAction(token.taskId)
      return
    }
    const updated = await executionTaskApi.complete(token.taskId, token.executionId, request)
    if (Number(updated?.task?.id) !== token.taskId
        || updated.task.taskStatus !== 'COMPLETED') {
      throw new Error('登记结果响应与目标不匹配')
    }
    completeDialog.value = false
    await reconcileTaskAction(token.taskId)
    ElMessage.success('执行结果已登记')
  } catch (error) {
    taskActionFailure(error, '登记执行结果失败')
    // If a network timeout hid success, do not keep an editable result dialog
    // for a now-terminal task; preserve input only when still RUNNING.
    try {
      const latest = await latestTaskForAction(token.taskId)
      if (latest.task.taskStatus !== 'RUNNING'
          || !matchingExecution(latest, token.executionId, 'RUNNING', 'MANUAL')) {
        completeDialog.value = false
      }
    } catch (_) { /* Keep user input if state cannot be confirmed. */ }
    await reconcileTaskAction(token.taskId)
  } finally {
    releaseTaskAction(token)
  }
}
async function handleHuman(taskId, decision) {
  if (!['CONFIRMED', 'REJECTED'].includes(decision)) return
  const token = claimTaskAction('human', taskId)
  if (!token) return
  try {
    const answer = await ElMessageBox.prompt(
      decision === 'REJECTED' ? '请说明拒绝原因' : '可填写人工操作结果或备注',
      decision === 'REJECTED' ? '拒绝人工介入' : '确认人工操作',
      { confirmButtonText: decision === 'REJECTED' ? '确认拒绝' : '确认继续',
        cancelButtonText: '取消', inputType: 'textarea' }
    )
    const latest = await latestTaskForAction(token.taskId)
    const attempt = latest.executions[0]
    if (latest.task.taskType !== 'EXECUTE_CASE'
        || latest.task.taskStatus !== 'WAITING_HUMAN'
        || attempt?.executionStatus !== 'WAITING_HUMAN') {
      ElMessage.warning('任务状态已变化，未重复提交人工决定')
      await reconcileTaskAction(token.taskId)
      return
    }
    const updated = await executionTaskApi.humanIntervention(token.taskId, {
      decision, note: answer.value, decidedBy: 'local-user'
    })
    const expected = decision === 'REJECTED' ? 'COMPLETED' : 'PENDING'
    if (Number(updated?.task?.id) !== token.taskId
        || updated.task.taskStatus !== expected) throw new Error('人工介入响应状态不匹配')
    await reconcileTaskAction(token.taskId)
    ElMessage.success(decision === 'CONFIRMED'
      ? '已确认，任务回到待执行状态' : '已拒绝，执行结果登记为阻塞')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      taskActionFailure(error, '人工介入处理失败')
      await reconcileTaskAction(token.taskId)
    }
  } finally {
    releaseTaskAction(token)
  }
}
async function cancelTask(task) {
  const id = Number(task?.id)
  if (taskAction.value !== null || cancelBusyId.value !== null
      || !Number.isSafeInteger(id) || id <= 0
      || !isActive(task?.taskStatus)) return
  // The lock includes the confirmation prompt, so two clicks cannot open two
  // prompts or send two cancellation requests.
  cancelBusyId.value = id
  const action = { type: 'cancel', taskId: id }
  taskAction.value = action
  try {
    const answer = await ElMessageBox.prompt('可填写取消原因', '取消执行任务', {
      confirmButtonText: '确认取消', cancelButtonText: '返回', inputType: 'textarea'
    })
    // Recheck server truth after the user confirms: a Runner may have finished
    // the task while the confirmation dialog was open.
    const latest = await executionTaskApi.get(id)
    if (Number(latest?.task?.id) !== id || !isActive(latest.task.taskStatus)) {
      ElMessage.warning('任务状态已变化，未发送取消请求，请刷新后核对')
      if (detailDialog.value && detail.value?.task?.id === id) await openDetail({ id })
      await loadData()
      await loadAttention()
      return
    }
    await executionTaskApi.cancel(id, {
      note: answer.value || '', cancelledBy: 'local-user'
    })
    if (detailDialog.value && detail.value?.task?.id === id) await openDetail({ id })
    await loadData()
    await loadAttention()
    ElMessage.success('任务已取消')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '取消任务失败，请重试')
      // On a network timeout, do not guess whether the server committed:
      // refresh the latest server state before permitting another cancellation.
      if (detailDialog.value && detail.value?.task?.id === id) await openDetail({ id })
      await loadData()
      await loadAttention()
    }
  } finally {
    cancelBusyId.value = null
    releaseTaskAction(action)
  }
}
async function resumeTask(task) {
  const token = claimTaskAction('resume', task?.id)
  if (!token) return
  try {
    const latest = await latestTaskForAction(token.taskId)
    if (latest.task.taskType !== 'EXECUTE_CASE'
        || latest.task.taskStatus !== 'RECOVERY_REQUIRED') {
      ElMessage.warning('该任务状态已变化，请刷新后重试')
      await reconcileTaskAction(token.taskId)
      return
    }
    const previous = latest.executions?.[0]
    if (!previous || previous.executionStatus !== 'INTERRUPTED') {
      ElMessage.warning('未找到可恢复的中断执行记录')
      return
    }
    const originalAttemptId = Number(previous.id)
    const fixedScript = ['HTTP', 'NODE', 'BROWSER'].includes(previous.runnerType)
    const caution = fixedScript
      ? '固定脚本将从第一步重新执行。请先确认上次执行没有造成不可重复的业务操作。'
      : '请先核对上次执行日志、检查点和业务结果，避免重复执行已完成的操作。'
    await ElMessageBox.prompt(
      '任务：' + (latest.task.taskNo || token.taskId) + '。' + caution +
      ' 恢复将保留旧尝试并创建新尝试。请输入“恢复”确认。',
      '人工确认恢复执行',
      { confirmButtonText: '确认恢复', cancelButtonText: '取消',
        inputPattern: /^恢复$/, inputErrorMessage: '请输入“恢复”以确认已核查风险',
        inputPlaceholder: '请输入：恢复' }
    )
    // A second browser could have resumed this task while our prompt was open.
    const current = await latestTaskForAction(token.taskId)
    if (current.task.taskType !== 'EXECUTE_CASE'
        || current.task.taskStatus !== 'RECOVERY_REQUIRED'
        || Number(current.executions[0]?.id) !== originalAttemptId
        || current.executions[0].executionStatus !== 'INTERRUPTED') {
      ElMessage.warning('任务已发生变化，未重复创建恢复尝试')
      await reconcileTaskAction(token.taskId)
      return
    }
    const updated = await executionTaskApi.resume(token.taskId)
    if (Number(updated?.task?.id) !== token.taskId
        || updated.task.taskStatus !== 'PENDING') {
      throw new Error('恢复任务响应与当前操作不匹配')
    }
    await reconcileTaskAction(token.taskId)
    ElMessage.success('已创建新的待执行尝试，旧执行记录保留')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      taskActionFailure(error, '恢复任务失败')
      await reconcileTaskAction(token.taskId)
    }
  } finally {
    releaseTaskAction(token)
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
  return ({ MANUAL: '人工', CHATGPT: 'ChatGPT', NODE: 'Node.js', BROWSER: 'Browser', PYTHON: 'Python', JAVA: 'Java', HTTP: 'HTTP' })[value] || value || '—'
}
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '—' }
onMounted(() => {
  if (reviewTarget.value) navigateFromReport()
  else loadData()
  loadRunnerStatus()
  loadAttention()
  runnerMonitorTimer = window.setInterval(loadRunnerStatus, 10000)
  attentionTimer = window.setInterval(loadAttention, 30000)
})
onUnmounted(() => {
  if (runnerMonitorTimer !== null) window.clearInterval(runnerMonitorTimer)
  if (attentionTimer !== null) window.clearInterval(attentionTimer)
})
</script>

<style scoped>
.review-link-alert { margin-bottom: 16px; }
.attention-card { margin-bottom:16px; }
.attention-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.attention-heading strong { color:#293b56; font-size:14px; }
.attention-heading span { color:#8b96a7; font-size:11px; }
.attention-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:12px; }
.attention-item { border:1px solid #edf0f5; border-radius:9px; padding:10px 12px; background:#f9fafc; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.attention-item span { color:#65738a; font-size:12px; }
.attention-item strong { color:#293b56; font-size:20px; font-variant-numeric:tabular-nums; }
.attention-card .el-alert + .el-alert { margin-top:8px; }
@media(max-width:850px) { .attention-summary { grid-template-columns:1fr; } .attention-heading { align-items:flex-start; flex-direction:column; } }
.runner-status-card { margin-bottom: 16px; }
.runner-monitor-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.runner-monitor-heading strong { font-size:14px; color:#2b3a50; }
.runner-monitor-heading span { font-size:11px; color:#8491a5; margin-left:12px; }
.runner-monitor-error { padding:8px 12px; color:#ae6316; background:#fff8ec; border-radius:8px; margin-bottom:12px; font-size:12px; }
.runner-status-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.runner-status-item { padding:12px; border-radius:10px; border:1px solid #edf0f5; background:#f9fafc; min-width:0; }
.runner-status-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
.runner-status-title strong { font-size:12px; }
.runner-status-detail { display:flex; gap:8px; justify-content:space-between; flex-wrap:wrap; overflow-wrap:anywhere; font-size:11px; color:#7a889c; margin-top:4px; }
@media (max-width: 850px) { .runner-status-grid { grid-template-columns:1fr; } .runner-monitor-heading span { display:block; margin:6px 0 0; } }
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
