<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">QUALITY MANAGEMENT</div>
        <h1>测试用例</h1>
        <p>维护测试用例、执行步骤、需求覆盖关系及不可覆盖的修订历史。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建测试用例</el-button>
    </div>

    <el-alert v-if="requirementContextId" type="info" :closable="false" show-icon
      :title="'正在查看需求 #' + requirementContextId + ' 关联的测试用例（按关联关系筛选）'"
      style="margin-bottom: 16px">
      <el-button link type="primary" :disabled="editDialog || saving" @click="clearRequirementContext">返回全部用例</el-button>
      <el-button link type="success" :disabled="editDialog || saving" @click="openCreate">为此需求新增用例</el-button>
    </el-alert>
    <el-alert v-if="versionsError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'版本下拉选项加载失败：' + versionsError">
      <el-button link type="primary" @click="loadVersionOptions">重试加载版本</el-button>
    </el-alert>
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filters.keyword" class="filter-keyword" clearable
          placeholder="搜索用例编号、名称或负责人" @keyup.enter="search" />
        <el-select v-model="filters.status" class="filter-status" clearable placeholder="用例状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.testType" class="filter-status" clearable placeholder="用例类型">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.priority" class="filter-status" clearable placeholder="优先级">
          <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.executionMode" class="filter-status" clearable placeholder="执行方式">
          <el-option v-for="item in executionModeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-alert v-if="listError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'测试用例列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>用例列表</strong><span class="muted-count">共 {{ total }} 条</span></div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="用例编号 / 名称" min-width="230">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.caseNo }}</div>
            <div class="secondary-cell">{{ row.title }}</div>
          </template>
        </el-table-column>
        <el-table-column label="修订" width="90" align="center">
          <template #default="{ row }">V{{ row.currentRevisionNo || 1 }}</template>
        </el-table-column>
        <el-table-column label="关联需求" width="100" align="center">
          <template #default="{ row }">{{ row.requirementCount || 0 }} 项</template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ typeLabel(row.testType) }}</template>
        </el-table-column>
        <el-table-column label="优先级" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityTag(row.priority)">{{ priorityLabel(row.priority) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行方式" width="125">
          <template #default="{ row }">
            <el-tag size="small" :type="executionModeTag(row.executionMode)">{{ executionModeLabel(row.executionMode) }}</el-tag>
            <div v-if="row.scriptName" class="secondary-cell">{{ row.scriptName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'info'">
              {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="负责人" prop="ownerName" width="100">
          <template #default="{ row }">{{ row.ownerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="155">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openHistory(row)">修订历史</el-button>
            <el-button link type="success" :disabled="row.status !== 'ACTIVE' || saving" @click="goAddToCycle(row)">加入轮次</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无测试用例，请新建第一条用例" />
        </template>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="editDialog" :title="editing ? '编辑测试用例' : '新建测试用例'"
      width="920px" top="5vh" destroy-on-close @close="invalidateEditor"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <div v-if="editorLoading" v-loading="true" style="min-height: 80px" />
      <el-alert v-if="editorError" type="error" show-icon :closable="false"
        :title="(editing ? '用例详情加载失败：' : '关联需求预填失败：') + editorError">
        <el-button v-if="editing" link type="primary" @click="retryEditDetail">重试读取用例详情</el-button>
        <el-button v-else-if="prefillRequestedId" link type="primary" @click="retrySourceRequirement">重试读取关联需求</el-button>
      </el-alert>
      <el-alert v-if="sourceRequirement && !editing" type="info" :closable="false" show-icon
        :title="'来源需求已预选：' + sourceRequirement.label + '（保存时必须保留该关联）'"
        style="margin-bottom: 12px" />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon
        :disabled="editorLoading || !!editorError || saving">
        <div class="form-two-columns">
          <el-form-item label="用例编号" prop="caseNo">
            <el-input v-model.trim="form.caseNo" maxlength="64" placeholder="例如 TC-LOGIN-001" />
          </el-form-item>
          <el-form-item label="用例名称" prop="title">
            <el-input v-model.trim="form.title" maxlength="255" placeholder="简要描述验证目标" />
          </el-form-item>
          <el-form-item label="用例类型" prop="testType">
            <el-select v-model="form.testType" style="width:100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级" prop="priority">
            <el-select v-model="form.priority" style="width:100%">
              <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" style="width:100%">
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="INACTIVE" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人">
            <el-input v-model.trim="form.ownerName" maxlength="64" placeholder="可选" />
          </el-form-item>
        </div>

        <el-divider content-position="left">执行配置</el-divider>
        <div class="form-two-columns">
          <el-form-item label="执行方式" prop="executionMode">
            <el-select v-model="form.executionMode" style="width:100%" @change="handleExecutionModeChange">
              <el-option v-for="item in executionModeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.executionMode === 'SCRIPT'" label="关联脚本" prop="scriptId">
            <el-select v-model="form.scriptId" style="width:100%" clearable filterable
              :loading="scriptsLoading" :disabled="scriptsLoading || !!scriptsError"
              placeholder="选择已启用脚本">
              <el-option v-for="item in scripts" :key="item.id"
                :label="item.scriptName + ' (' + item.scriptLanguage + ')'" :value="item.id" />
            </el-select>
            <div v-if="!scripts.length && !scriptsLoading && !scriptsError" class="form-tip">暂无已启用的脚本，可先到脚本管理中启用。</div>
            <div v-if="scriptsLoading" class="form-tip">正在加载全部已启用脚本…</div>
            <el-alert v-if="scriptsError" type="error" show-icon :closable="false"
              :title="'脚本选项加载失败：' + scriptsError">
              <el-button link type="primary" @click="loadScripts">重试加载脚本</el-button>
            </el-alert>
          </el-form-item>
        </div>
        <el-form-item v-if="form.executionMode === 'AI'" label="ChatGPT 执行指令" prop="aiInstruction">
          <el-input v-model="form.aiInstruction" type="textarea" :rows="3"
            placeholder="描述 ChatGPT 如何操作系统、调用接口、检查页面或执行断言。需要人工介入的步骤也请明确标出。" />
        </el-form-item>

        <el-divider content-position="left">测试内容</el-divider>
        <el-form-item label="前置条件">
          <el-input v-model="form.preconditions" type="textarea" :rows="2" placeholder="执行本用例前必须满足的条件" />
        </el-form-item>
        <div class="steps-heading">
          <strong>测试步骤</strong>
          <el-button size="small" plain type="primary" @click="addStep">添加步骤</el-button>
        </div>
        <div v-for="(step, index) in form.steps" :key="index" class="step-editor">
          <div class="step-editor-title">
            <strong>步骤 {{ index + 1 }}</strong>
            <el-button v-if="form.steps.length > 1" link type="danger" @click="removeStep(index)">删除</el-button>
          </div>
          <el-form-item :label="'操作描述'" :prop="'steps.' + index + '.action'"
            :rules="[{ required: true, message: '请输入步骤操作', trigger: 'blur' }]">
            <el-input v-model="step.action" type="textarea" :rows="2" placeholder="具体操作或需要 ChatGPT 执行的动作" />
          </el-form-item>
          <el-form-item label="操作数据">
            <el-input v-model="step.testData" type="textarea" :rows="1" placeholder="输入值、请求参数或其他测试数据（可选）" />
          </el-form-item>
          <el-form-item label="步骤预期结果" :prop="'steps.' + index + '.expectedResult'"
            :rules="[{ required: true, message: '请输入步骤预期结果', trigger: 'blur' }]">
            <el-input v-model="step.expectedResult" type="textarea" :rows="2" placeholder="本步骤完成后应观察到的结果" />
          </el-form-item>
        </div>
        <el-form-item label="整体预期结果" prop="expectedResult">
          <el-input v-model="form.expectedResult" type="textarea" :rows="2" placeholder="整个用例执行成功的判定标准" />
        </el-form-item>

        <el-divider content-position="left">需求覆盖关系</el-divider>
        <el-alert v-if="requirementsError" type="error" show-icon :closable="false"
          style="margin: 12px 0" :title="'关联需求选项加载失败：' + requirementsError">
          <el-button link type="primary" @click="loadRequirements">重试加载关联需求</el-button>
        </el-alert>
        <div v-if="requirementsLoading" class="form-tip">正在加载全部可关联需求…</div>
        <el-form-item label="筛选版本">
          <el-select v-model="requirementVersionId" clearable filterable style="width:100%"
            :disabled="!!sourceRequirement || editorLoading"
            placeholder="不选择则显示所有版本需求" @change="loadRequirements">
            <el-option v-for="item in versions" :key="item.id"
              :label="item.projectName + ' / ' + item.versionNo" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联需求">
          <el-select v-model="form.requirementIds" multiple filterable clearable collapse-tags
            :loading="requirementsLoading" :disabled="requirementsLoading || !!requirementsError"
            collapse-tags-tooltip style="width:100%" placeholder="选择本用例覆盖的需求">
            <el-option v-for="item in availableRequirements" :key="item.requirementId"
              :label="requirementLabel(item)" :value="item.requirementId" />
          </el-select>
        </el-form-item>
        <el-form-item label="测试数据 JSON">
          <el-input v-model="form.testDataJson" type="textarea" :rows="3"
            placeholder='可选，例如：{"username":"tester","expectedCode":200}' />
        </el-form-item>
        <el-form-item v-if="editing" label="本次修订说明">
          <el-input v-model.trim="form.changeNote" maxlength="1000" type="textarea" :rows="2"
            placeholder="说明本次修改内容；保存后会生成新的修订版本" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving"
          :disabled="editorLoading || !!editorError || requirementsLoading || !!requirementsError || (form.executionMode === 'SCRIPT' && (scriptsLoading || !!scriptsError))"
          @click="saveTestCase">
          {{ editing ? '保存并生成新修订' : '创建用例' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialog" title="测试用例修订历史" width="900px" top="6vh" destroy-on-close
      @close="invalidateHistory">
      <div v-if="historyCase" class="history-case-heading">
        <strong>{{ historyCase.caseNo }} · {{ historyCase.title }}</strong>
        <span>当前版本：V{{ historyCase.currentRevisionNo }}</span>
      </div>
      <el-alert v-if="historyError" type="error" show-icon :closable="false"
        :title="'读取修订历史失败：' + historyError">
        <el-button link type="primary" @click="retryHistory">重试加载历史</el-button>
      </el-alert>
      <div class="history-layout">
        <div class="history-list">
          <div v-if="!revisions.length" class="form-tip">暂无修订记录</div>
          <button v-for="item in revisions" :key="item.id"
            class="history-item" :class="{ selected: selectedRevision && selectedRevision.id === item.id }"
            @click="selectRevision(item)">
            <strong>V{{ item.revisionNo }}{{ item.revisionNo === historyCase?.currentRevisionNo ? '（当前）' : '' }}</strong>
            <span>{{ formatDate(item.createdAt) }}</span>
            <small>{{ item.changeNote || '未填写修订说明' }}</small>
          </button>
        </div>
        <div class="history-detail">
          <el-skeleton v-if="historyLoading" :rows="7" animated />
          <template v-else-if="selectedRevision">
            <div class="history-detail-head">
              <div>
                <el-tag size="small">V{{ selectedRevision.revisionNo }}</el-tag>
                <strong>{{ executionModeLabel(selectedRevision.executionMode) }} · {{ priorityLabel(selectedRevision.priority) }}</strong>
              </div>
              <span>{{ formatDate(selectedRevision.createdAt) }}</span>
            </div>
            <p v-if="selectedRevision.changeNote" class="history-note">{{ selectedRevision.changeNote }}</p>
            <h4>前置条件</h4>
            <p class="history-text">{{ selectedRevision.preconditions || '无' }}</p>
            <h4>测试步骤</h4>
            <div v-for="step in selectedRevision.steps || []" :key="step.stepNo" class="history-step">
              <strong>{{ step.stepNo }}. {{ step.action }}</strong>
              <p v-if="step.testData">操作数据：{{ step.testData }}</p>
              <p>预期结果：{{ step.expectedResult }}</p>
            </div>
            <h4>整体预期结果</h4>
            <p class="history-text">{{ selectedRevision.expectedResult }}</p>
            <h4 v-if="selectedRevision.aiInstruction">ChatGPT 执行指令</h4>
            <p v-if="selectedRevision.aiInstruction" class="history-text">{{ selectedRevision.aiInstruction }}</p>
          </template>
          <el-empty v-else description="请选择一个修订版本" />
        </div>
      </div>
      <template #footer>
        <el-button @click="historyDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contextId } from '../utils/contextNavigation'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElDivider, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElSkeleton, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { testCaseApi } from '../api/testCases'
import { requirementApi } from '../api/requirements'
import { requestedCaseRequirement, verifiedSourceRequirement,
  assertSourceCoverage } from '../utils/caseCreationContext'
import { versionApi } from '../api/versions'
import { testScriptApi } from '../api/testScripts'
import { createLatestRequest } from '../utils/latestRequest'
import { loadPagedOptions } from '../utils/pagedOptions'

const statusOptions = [
  { value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }
]
const typeOptions = [
  { value: 'FUNCTIONAL', label: '功能测试' }, { value: 'REGRESSION', label: '回归测试' },
  { value: 'INTEGRATION', label: '集成测试' }, { value: 'API', label: '接口测试' },
  { value: 'UI', label: '页面测试' }, { value: 'PERFORMANCE', label: '性能测试' },
  { value: 'SECURITY', label: '安全测试' }, { value: 'OTHER', label: '其他' }
]
const priorityOptions = [
  { value: 'LOW', label: '低' }, { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' }, { value: 'URGENT', label: '紧急' }
]
const executionModeOptions = [
  { value: 'MANUAL', label: '人工执行' },
  { value: 'SCRIPT', label: '关联固定脚本' },
  { value: 'AI', label: 'ChatGPT 动态执行' }
]
const route = useRoute()
const router = useRouter()
const requirementContextId = computed(() => contextId(route.query.requirementId))
function goAddToCycle(row) {
  const id = contextId(row?.id)
  if (!id || row?.status !== 'ACTIVE' || saving.value) return
  void router.push({ name: 'test-cycles', query: { caseId: String(id) } })
}
function clearRequirementContext() {
  if (editDialog.value || saving.value) return
  router.replace({ name: 'test-cases', query: {} })
}
watch([() => route.query.requirementId, () => route.query.create], () => {
  pageNum.value = 1
  void loadData()
  // A new deep link (not a duplicate refresh) opens a new isolated editor.
  if (requestedCaseRequirement(route.query) && !saving.value) openCreate()
})
const loading = ref(false)
const listGate = createLatestRequest()
const listError = ref('')
const saving = ref(false)
const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', status: '', testType: '', priority: '', executionMode: '' })
const editDialog = ref(false)
const editing = ref(false)
const editingId = ref(null)
const editorGate = createLatestRequest()
const editorToken = ref(null)
const editorLoading = ref(false)
const editorError = ref('')
const formRef = ref()
const form = reactive(emptyForm())
const scripts = ref([])
const versions = ref([])
const versionsError = ref('')
const availableRequirements = ref([])
const requirementsGate = createLatestRequest()
const scriptsGate = createLatestRequest()
const requirementsError = ref('')
const scriptsError = ref('')
const requirementsLoading = ref(false)
const scriptsLoading = ref(false)
const requirementVersionId = ref(null)
const sourceRequirement = ref(null)
const prefillRequestedId = ref(null)
const historyDialog = ref(false)
const historyCase = ref(null)
const revisions = ref([])
const selectedRevision = ref(null)
const historyLoading = ref(false)
const historyGate = createLatestRequest()
const revisionGate = createLatestRequest()
const historyError = ref('')

function emptyForm() {
  return {
    caseNo: '', title: '', status: 'ACTIVE', ownerName: '',
    preconditions: '', steps: [emptyStep()], expectedResult: '',
    testType: 'FUNCTIONAL', priority: 'MEDIUM', executionMode: 'MANUAL',
    scriptId: null, aiInstruction: '', testDataJson: '', changeNote: '',
    requirementIds: [], createdBy: 'local-user'
  }
}
function emptyStep() { return { stepNo: null, action: '', testData: '', expectedResult: '' } }
const rules = {
  caseNo: [{ required: true, message: '请输入用例编号', trigger: 'blur' }],
  title: [{ required: true, message: '请输入用例名称', trigger: 'blur' }],
  testType: [{ required: true, message: '请选择用例类型', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  executionMode: [{ required: true, message: '请选择执行方式', trigger: 'change' }],
  expectedResult: [{ required: true, message: '请输入整体预期结果', trigger: 'blur' }],
  scriptId: [{ required: true, message: '请选择关联脚本', trigger: 'change' }],
  aiInstruction: [{ required: true, message: '请输入 ChatGPT 执行指令', trigger: 'blur' }]
}

async function loadData() {
  const requestId = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await testCaseApi.page({
      ...filters, keyword: filters.keyword || undefined,
      status: filters.status || undefined, testType: filters.testType || undefined,
      priority: filters.priority || undefined, executionMode: filters.executionMode || undefined,
      requirementId: requirementContextId.value || undefined,
      pageNum: pageNum.value, pageSize: pageSize.value
    })
    if (!listGate.isCurrent(requestId)) return
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) {
    if (!listGate.isCurrent(requestId)) return
    rows.value = []
    total.value = 0
    listError.value = error.message || '网络异常，请重试'
  } finally {
    if (listGate.isCurrent(requestId)) loading.value = false
  }
}
function search() { pageNum.value = 1; loadData() }
function resetFilters() {
  Object.assign(filters, { keyword: '', status: '', testType: '', priority: '', executionMode: '' })
  search()
}
function handleSizeChange() { pageNum.value = 1; loadData() }
function addStep() { form.steps.push(emptyStep()) }
function removeStep(index) { form.steps.splice(index, 1) }
function handleExecutionModeChange() {
  if (form.executionMode !== 'SCRIPT') form.scriptId = null
  if (form.executionMode !== 'AI') form.aiInstruction = ''
}
async function loadRequirements() {
  const token = requirementsGate.begin()
  const selectedVersionId = requirementVersionId.value || undefined
  requirementsError.value = ''
  requirementsLoading.value = true
  availableRequirements.value = []
  try {
    const loaded = await loadPagedOptions(async params => {
      const response = await testCaseApi.availableRequirementsPage(params)
      return {
        ...response,
        // The selector uses requirementId; the shared completeness checker
        // requires a canonical id, without changing the API's field names.
        list: response.list?.map(item => ({ ...item, id: item.requirementId }))
      }
    }, { versionId: selectedVersionId })
    if (requirementsGate.isCurrent(token) && editDialog.value) availableRequirements.value = loaded
  } catch (error) {
    if (requirementsGate.isCurrent(token) && editDialog.value) {
      requirementsError.value = error.message || '需求关联选项加载失败'
    }
  } finally {
    if (requirementsGate.isCurrent(token) && editDialog.value) requirementsLoading.value = false
  }
}
function requirementLabel(item) {
  return [item.projectCode, item.versionNo, item.requirementNo, item.title].filter(Boolean).join(' / ')
}
function invalidateEditor() {
  editorGate.invalidate()
  requirementsGate.invalidate()
  scriptsGate.invalidate()
  sourceRequirement.value = null
  prefillRequestedId.value = null
  editorToken.value = null
  editorLoading.value = false
  requirementsLoading.value = false
  scriptsLoading.value = false
}
function retryEditDetail() {
  if (editDialog.value && editing.value && editingId.value && !saving.value) {
    openEdit({ id: editingId.value })
  }
}
async function prefillSourceRequirement(id, token) {
  editorLoading.value = true
  editorError.value = ''
  sourceRequirement.value = null
  try {
    const detail = await requirementApi.get(id)
    if (!editorGate.isCurrent(token) || !editDialog.value) return
    const source = verifiedSourceRequirement(detail, id)
    sourceRequirement.value = source
    requirementVersionId.value = source.versionId
    form.requirementIds = [source.id]
    await loadRequirements()
    if (!editorGate.isCurrent(token) || !editDialog.value) return
    if (requirementsError.value) throw new Error(requirementsError.value)
    assertSourceCoverage(source, form.requirementIds,
      availableRequirements.value, requirementVersionId.value)
  } catch (error) {
    if (editorGate.isCurrent(token) && editDialog.value) {
      editorError.value = error.message || '读取来源需求失败，请重试'
    }
  } finally {
    if (editorGate.isCurrent(token)) editorLoading.value = false
  }
}
function retrySourceRequirement() {
  if (saving.value || !editDialog.value || editing.value || !prefillRequestedId.value) return
  const token = editorGate.begin()
  editorToken.value = token
  void prefillSourceRequirement(prefillRequestedId.value, token)
}
function openCreate() {
  if (saving.value) return
  const token = editorGate.begin()
  editorToken.value = token
  editorLoading.value = false
  editorError.value = ''
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  requirementVersionId.value = null
  sourceRequirement.value = null
  prefillRequestedId.value = requirementContextId.value
  editDialog.value = true
  void loadScripts()
  if (prefillRequestedId.value) void prefillSourceRequirement(prefillRequestedId.value, token)
  else void loadRequirements()
}
async function openEdit(row) {
  if (saving.value) return
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = editorGate.begin()
  editorToken.value = token
  editing.value = true
  editingId.value = id
  sourceRequirement.value = null
  prefillRequestedId.value = null
  editorError.value = ''
  editorLoading.value = true
  requirementVersionId.value = null
  // Clear the previous case immediately: old data may never appear in this editor.
  Object.assign(form, emptyForm())
  editDialog.value = true
  void Promise.all([loadScripts(), loadRequirements()])
  try {
    const detail = await testCaseApi.get(id)
    if (!editorGate.isCurrent(token) || !editDialog.value) return
    if (Number(detail?.id) !== id || !detail.currentRevision
        || !Array.isArray(detail.requirements)) {
      throw new Error('用例详情与当前编辑目标不一致，请重试')
    }
    const revision = detail.currentRevision
    Object.assign(form, {
      caseNo: detail.caseNo, title: detail.title, status: detail.status,
      ownerName: detail.ownerName || '', preconditions: revision.preconditions || '',
      steps: revision.steps?.length ? revision.steps.map(item => ({ ...item })) : [emptyStep()],
      expectedResult: revision.expectedResult || '', testType: revision.testType || 'FUNCTIONAL',
      priority: revision.priority || 'MEDIUM', executionMode: revision.executionMode || 'MANUAL',
      scriptId: revision.scriptId || null, aiInstruction: revision.aiInstruction || '',
      testDataJson: revision.testDataJson || '', changeNote: '',
      requirementIds: detail.requirements.map(item => item.requirementId),
      createdBy: 'local-user'
    })
    formRef.value?.clearValidate()
  } catch (error) {
    if (editorGate.isCurrent(token) && editDialog.value) {
      editorError.value = error.message || '读取用例详情失败'
    }
  } finally {
    if (editorGate.isCurrent(token)) editorLoading.value = false
  }
}
async function loadScripts() {
  const token = scriptsGate.begin()
  scriptsError.value = ''
  scriptsLoading.value = true
  scripts.value = []
  try {
    const loaded = await loadPagedOptions(testScriptApi.page, { enabled: true })
    if (scriptsGate.isCurrent(token)) scripts.value = loaded
  } catch (error) {
    if (scriptsGate.isCurrent(token)) {
      scriptsError.value = error.message || '已启用脚本加载失败'
    }
  } finally {
    if (scriptsGate.isCurrent(token)) scriptsLoading.value = false
  }
}
async function saveTestCase() {
  if (saving.value) return
  const sessionToken = editorToken.value
  // Never overwrite requirement links while only a partial/failed selection
  // was loaded. An editing user may otherwise unknowingly erase coverage.
  if (!editDialog.value || !editorToken.value || !editorGate.isCurrent(editorToken.value)
      || editorLoading.value || editorError.value || requirementsLoading.value || requirementsError.value
      || (form.executionMode === 'SCRIPT' && (scriptsLoading.value || scriptsError.value))) {
    ElMessage.warning('关联需求或脚本选项尚未完整加载，请重试后保存')
    return
  }
  // Include async form validation in the save critical section.
  saving.value = true
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid || !sessionToken || !editorGate.isCurrent(sessionToken)
        || !editDialog.value || editorLoading.value || editorError.value
        || requirementsLoading.value || requirementsError.value
        || (form.executionMode === 'SCRIPT' && (scriptsLoading.value || scriptsError.value))) return
    if (!form.steps.length || form.steps.some(item => !item.action.trim() || !item.expectedResult.trim())) {
      ElMessage.warning('请补齐所有测试步骤的操作和预期结果')
      return
    }
    if (prefillRequestedId.value) {
      try {
        if (editing.value || requirementContextId.value !== prefillRequestedId.value
            || sourceRequirement.value?.id !== prefillRequestedId.value) {
          throw new Error('来源需求已变化，请从需求列表重新进入新增用例')
        }
        assertSourceCoverage(sourceRequirement.value, form.requirementIds,
          availableRequirements.value, requirementVersionId.value)
      } catch (error) {
        ElMessage.warning(error.message || '来源需求关联校验失败')
        return
      }
    }
    const payload = {
      ...form,
      steps: form.steps.map((item, index) => ({ ...item, stepNo: index + 1 })),
      requirementIds: [...form.requirementIds]
    }
    if (editing.value) {
      await testCaseApi.update(editingId.value, payload)
      if (editorGate.isCurrent(sessionToken)) ElMessage.success('用例已更新，并生成新的修订版本')
    } else {
      await testCaseApi.create(payload)
      if (editorGate.isCurrent(sessionToken)) ElMessage.success('测试用例创建成功')
    }
    if (editorGate.isCurrent(sessionToken)) {
      const clearCreateFlag = !editing.value && route.query.create === '1'
        && prefillRequestedId.value === requirementContextId.value
      editDialog.value = false
      if (clearCreateFlag) {
        await router.replace({ name: 'test-cases',
          query: { requirementId: String(prefillRequestedId.value) } })
      } else {
        await loadData()
      }
    }
  } catch (error) {
    if (editorGate.isCurrent(sessionToken)) ElMessage.error(error.message || '保存测试用例失败')
  } finally {
    saving.value = false
  }
}
function invalidateHistory() {
  historyGate.invalidate()
  revisionGate.invalidate()
  historyLoading.value = false
}
function retryHistory() {
  if (historyDialog.value && historyCase.value) openHistory(historyCase.value)
}
async function openHistory(row) {
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = historyGate.begin()
  revisionGate.invalidate()
  historyCase.value = { ...row, id }
  revisions.value = []
  selectedRevision.value = null
  historyError.value = ''
  historyDialog.value = true
  historyLoading.value = true
  try {
    const items = await testCaseApi.revisions(id)
    if (!historyGate.isCurrent(token) || !historyDialog.value) return
    if (!Array.isArray(items)) throw new Error('修订历史响应格式异常')
    revisions.value = items
    if (items.length) await selectRevision(items[0])
  } catch (error) {
    if (historyGate.isCurrent(token) && historyDialog.value) {
      historyError.value = error.message || '加载修订历史失败'
    }
  } finally {
    if (historyGate.isCurrent(token) && (!revisions.value.length || historyError.value)) {
      historyLoading.value = false
    }
  }
}
async function selectRevision(item) {
  if (!historyDialog.value || !historyCase.value) return
  const caseId = historyCase.value.id
  const token = revisionGate.begin()
  selectedRevision.value = null
  historyError.value = ''
  historyLoading.value = true
  try {
    const next = await testCaseApi.getRevision(caseId, item.id)
    if (!revisionGate.isCurrent(token) || !historyDialog.value
        || historyCase.value?.id !== caseId) return
    if (Number(next?.id) !== Number(item.id)) {
      throw new Error('修订版本与当前选择不一致')
    }
    selectedRevision.value = next
  } catch (error) {
    if (revisionGate.isCurrent(token) && historyDialog.value) {
      historyError.value = error.message || '加载修订版本失败'
    }
  } finally {
    if (revisionGate.isCurrent(token)) historyLoading.value = false
  }
}
function typeLabel(value) { return typeOptions.find(item => item.value === value)?.label || value || '—' }
function priorityLabel(value) { return priorityOptions.find(item => item.value === value)?.label || value || '—' }
function priorityTag(value) { return ({ LOW: 'info', MEDIUM: '', HIGH: 'warning', URGENT: 'danger' })[value] || 'info' }
function executionModeLabel(value) { return executionModeOptions.find(item => item.value === value)?.label || value || '—' }
function executionModeTag(value) { return ({ MANUAL: 'info', SCRIPT: 'success', AI: 'warning' })[value] || 'info' }
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '—' }

async function loadVersionOptions() {
  versionsError.value = ''
  try {
    versions.value = await loadPagedOptions(versionApi.page)
  } catch (error) {
    versions.value = []
    versionsError.value = error.message || '版本选项加载失败，请重试'
  }
}
onMounted(async () => {
  await Promise.all([loadVersionOptions(), loadScripts()])
  await loadData()
  // Direct navigation from a requirement opens the form once, after initial
  // page dependencies are ready. Query flags never trigger a write by themselves.
  if (requestedCaseRequirement(route.query) && !editDialog.value) openCreate()
})
onUnmounted(() => {
  listGate.invalidate()
  invalidateEditor()
  invalidateHistory()
})
</script>

<style scoped>
.form-tip { margin-top: 6px; color: #9aa4b5; font-size: 11px; line-height: 1.5; }
.steps-heading { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 12px 112px; }
.steps-heading strong { font-size: 13px; color: #394967; }
.step-editor { margin: 0 0 14px 112px; padding: 14px 14px 2px; background: #f8f9fc; border: 1px solid #edf0f5; border-radius: 9px; }
.step-editor-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; color: #43516a; font-size: 12px; }
.history-case-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; color: #3b4961; font-size: 13px; }
.history-case-heading span { color: #8b96a7; font-size: 11px; }
.history-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 18px; min-height: 390px; }
.history-list { border-right: 1px solid #edf0f5; padding-right: 14px; }
.history-item { display: block; width: 100%; text-align: left; padding: 11px 12px; margin-bottom: 8px; border: 1px solid #edf0f5; border-radius: 9px; background: white; cursor: pointer; }
.history-item.selected { border-color: #8ca4f0; background: #f4f6ff; }
.history-item strong, .history-item span, .history-item small { display: block; }
.history-item strong { color: #34425b; font-size: 12px; }
.history-item span, .history-item small { margin-top: 5px; color: #8c97a8; font-size: 10px; }
.history-item small { line-height: 1.5; }
.history-detail { min-width: 0; max-height: 58vh; overflow: auto; padding-right: 6px; }
.history-detail-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.history-detail-head strong { margin-left: 9px; color: #647188; font-size: 11px; }
.history-detail-head span { color: #8c97a8; font-size: 10px; }
.history-detail h4 { margin: 18px 0 7px; color: #34425b; font-size: 12px; }
.history-text, .history-note { white-space: pre-wrap; overflow-wrap: anywhere; color: #647188; font-size: 12px; line-height: 1.7; }
.history-note { padding: 9px 11px; background: #fff9ed; border-radius: 7px; }
.history-step { padding: 10px 12px; margin-bottom: 8px; background: #f8f9fc; border-radius: 7px; }
.history-step strong { color: #394967; font-size: 12px; }
.history-step p { margin: 6px 0 0; color: #647188; font-size: 11px; line-height: 1.6; white-space: pre-wrap; }
@media (max-width: 760px) {
  .history-layout { grid-template-columns: 1fr; }
  .history-list { border-right: 0; border-bottom: 1px solid #edf0f5; padding: 0 0 12px; }
  .steps-heading, .step-editor { margin-left: 0; }
}
</style>