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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openHistory(row)">修订历史</el-button>
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
      width="920px" top="5vh" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon>
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
            <el-select v-model="form.scriptId" style="width:100%" clearable filterable placeholder="选择已启用脚本">
              <el-option v-for="item in scripts" :key="item.id"
                :label="item.scriptName + ' (' + item.scriptLanguage + ')'" :value="item.id" />
            </el-select>
            <div v-if="!scripts.length" class="form-tip">脚本库目前为空；脚本管理功能将在下一阶段补齐。</div>
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
        <el-form-item label="筛选版本">
          <el-select v-model="requirementVersionId" clearable filterable style="width:100%"
            placeholder="不选择则显示所有版本需求" @change="loadRequirements">
            <el-option v-for="item in versions" :key="item.id"
              :label="item.projectName + ' / ' + item.versionNo" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联需求">
          <el-select v-model="form.requirementIds" multiple filterable clearable collapse-tags
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
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTestCase">
          {{ editing ? '保存并生成新修订' : '创建用例' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialog" title="测试用例修订历史" width="900px" top="6vh" destroy-on-close>
      <div v-if="historyCase" class="history-case-heading">
        <strong>{{ historyCase.caseNo }} · {{ historyCase.title }}</strong>
        <span>当前版本：V{{ historyCase.currentRevisionNo }}</span>
      </div>
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
import { onMounted, reactive, ref } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElButton, ElCard, ElDialog, ElDivider, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElSkeleton, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { testCaseApi } from '../api/testCases'
import { versionApi } from '../api/versions'

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
const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', status: '', testType: '', priority: '', executionMode: '' })
const editDialog = ref(false)
const editing = ref(false)
const editingId = ref(null)
const formRef = ref()
const form = reactive(emptyForm())
const scripts = ref([])
const versions = ref([])
const availableRequirements = ref([])
const requirementVersionId = ref(null)
const historyDialog = ref(false)
const historyCase = ref(null)
const revisions = ref([])
const selectedRevision = ref(null)
const historyLoading = ref(false)

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
  loading.value = true
  try {
    const result = await testCaseApi.page({
      ...filters, keyword: filters.keyword || undefined,
      status: filters.status || undefined, testType: filters.testType || undefined,
      priority: filters.priority || undefined, executionMode: filters.executionMode || undefined,
      pageNum: pageNum.value, pageSize: pageSize.value
    })
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) { ElMessage.error(error.message) }
  finally { loading.value = false }
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
  try {
    availableRequirements.value = await testCaseApi.availableRequirements({
      versionId: requirementVersionId.value || undefined
    })
  } catch (error) { ElMessage.error(error.message) }
}
function requirementLabel(item) {
  return [item.projectCode, item.versionNo, item.requirementNo, item.title].filter(Boolean).join(' / ')
}
async function openCreate() {
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  form.steps = [emptyStep()]
  requirementVersionId.value = null
  editDialog.value = true
  await Promise.all([loadRequirements(), loadScripts()])
}
async function openEdit(row) {
  editing.value = true
  editingId.value = row.id
  requirementVersionId.value = null
  editDialog.value = true
  await Promise.all([loadScripts(), loadRequirements()])
  try {
    const detail = await testCaseApi.get(row.id)
    const revision = detail.currentRevision || {}
    Object.assign(form, {
      caseNo: detail.caseNo, title: detail.title, status: detail.status,
      ownerName: detail.ownerName || '', preconditions: revision.preconditions || '',
      steps: revision.steps?.length ? revision.steps.map(item => ({ ...item })) : [emptyStep()],
      expectedResult: revision.expectedResult || '', testType: revision.testType || 'FUNCTIONAL',
      priority: revision.priority || 'MEDIUM', executionMode: revision.executionMode || 'MANUAL',
      scriptId: revision.scriptId || null, aiInstruction: revision.aiInstruction || '',
      testDataJson: revision.testDataJson || '', changeNote: '',
      requirementIds: (detail.requirements || []).map(item => item.requirementId),
      createdBy: 'local-user'
    })
    formRef.value?.clearValidate()
  } catch (error) {
    ElMessage.error(error.message)
    editDialog.value = false
  }
}
async function loadScripts() {
  try { scripts.value = await testCaseApi.scripts() }
  catch (error) { ElMessage.error(error.message) }
}
async function saveTestCase() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (!form.steps.length || form.steps.some(item => !item.action.trim() || !item.expectedResult.trim())) {
    ElMessage.warning('请补齐所有测试步骤的操作和预期结果')
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form,
      steps: form.steps.map((item, index) => ({ ...item, stepNo: index + 1 })),
      requirementIds: [...form.requirementIds]
    }
    if (editing.value) {
      await testCaseApi.update(editingId.value, payload)
      ElMessage.success('用例已更新，并生成新的修订版本')
    } else {
      await testCaseApi.create(payload)
      ElMessage.success('测试用例创建成功')
    }
    editDialog.value = false
    await loadData()
  } catch (error) { ElMessage.error(error.message) }
  finally { saving.value = false }
}
async function openHistory(row) {
  historyCase.value = row
  revisions.value = []
  selectedRevision.value = null
  historyDialog.value = true
  historyLoading.value = true
  try {
    revisions.value = await testCaseApi.revisions(row.id)
    if (revisions.value.length) await selectRevision(revisions.value[0])
  } catch (error) { ElMessage.error(error.message) }
  finally { historyLoading.value = false }
}
async function selectRevision(item) {
  selectedRevision.value = null
  historyLoading.value = true
  try { selectedRevision.value = await testCaseApi.getRevision(historyCase.value.id, item.id) }
  catch (error) { ElMessage.error(error.message) }
  finally { historyLoading.value = false }
}
function typeLabel(value) { return typeOptions.find(item => item.value === value)?.label || value || '—' }
function priorityLabel(value) { return priorityOptions.find(item => item.value === value)?.label || value || '—' }
function priorityTag(value) { return ({ LOW: 'info', MEDIUM: '', HIGH: 'warning', URGENT: 'danger' })[value] || 'info' }
function executionModeLabel(value) { return executionModeOptions.find(item => item.value === value)?.label || value || '—' }
function executionModeTag(value) { return ({ MANUAL: 'info', SCRIPT: 'success', AI: 'warning' })[value] || 'info' }
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '—' }

onMounted(async () => {
  try {
    const [versionResult, scriptResult] = await Promise.all([
      versionApi.page({ pageNum: 1, pageSize: 100 }),
      testCaseApi.scripts()
    ])
    versions.value = versionResult.list || []
    scripts.value = scriptResult || []
  } catch (error) { ElMessage.error(error.message) }
  await loadData()
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