<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">TEST CAMPAIGNS</div>
        <h1>测试轮次</h1>
        <p>同一版本可以建立多个测试轮次；每轮只绑定一个环境，并固定代码版本、用例修订和需求覆盖快照。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建测试轮次</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="创建轮次时会锁定当前用例修订、关联需求及最新详细设计。后续修改原用例或需求，不会改变本轮测试依据。" />

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-select v-model="filters.versionId" class="filter-status" clearable filterable placeholder="全部版本">
          <el-option v-for="item in versions" :key="item.id"
            :label="item.projectName + ' / ' + item.versionNo" :value="item.id" />
        </el-select>
        <el-select v-model="filters.environmentId" class="filter-status" clearable placeholder="全部环境">
          <el-option v-for="item in environments" :key="item.id"
            :label="item.environmentName" :value="item.id" />
        </el-select>
        <el-select v-model="filters.status" class="filter-status" clearable placeholder="轮次状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input v-model="filters.keyword" class="filter-keyword" clearable
          placeholder="搜索轮次名称、代码版本" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>测试轮次列表</strong><span class="muted-count">共 {{ total }} 条</span></div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="测试轮次" min-width="210">
          <template #default="{ row }">
            <div class="primary-cell">第 {{ row.cycleNo }} 轮 · {{ row.cycleName }}</div>
            <div class="secondary-cell">{{ stageLabel(row.cycleStage) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="所属版本" min-width="190">
          <template #default="{ row }">
            <div>{{ row.projectName }}</div><div class="secondary-cell">{{ row.versionNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="测试环境" min-width="130">
          <template #default="{ row }">
            <div>{{ row.environmentName }}</div><div class="secondary-cell">{{ row.environmentCode }}</div>
          </template>
        </el-table-column>
        <el-table-column label="代码版本 / Commit" min-width="190">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.codeVersion }}</div>
            <div class="secondary-cell">{{ row.gitCommit || row.gitBranch || '未记录 Commit' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="用例" width="100">
          <template #default="{ row }">{{ row.caseCount || 0 }} 条</template>
        </el-table-column>
        <el-table-column label="结果统计" min-width="190">
          <template #default="{ row }">
            <div class="result-counts">
              <span class="pass-count">通过 {{ row.passCount || 0 }}</span>
              <span class="fail-count">失败 {{ row.failCount || 0 }}</span>
              <span class="blocked-count">阻塞 {{ row.blockedCount || 0 }}</span>
              <span class="skipped-count">跳过 {{ row.skippedCount || 0 }}</span>
            </div>
            <div class="secondary-cell">未执行 {{ row.notRunCount || 0 }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag size="small" :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="创建时间" width="155">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openReport(row)">报告</el-button>
            <el-button v-if="row.status === 'PLANNED'" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'PLANNED'" link type="success" @click="startCycle(row)">开始</el-button>
            <el-button v-if="row.status === 'RUNNING' || row.status === 'PLANNED'" link type="danger" @click="abortCycle(row)">终止</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无测试轮次，请先新建一轮测试" /></template>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="editDialog" :title="editing ? '编辑测试轮次' : '新建测试轮次'"
      width="860px" top="4vh" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon>
        <div class="form-two-columns">
          <el-form-item label="所属版本" prop="versionId">
            <el-select v-model="form.versionId" style="width:100%" filterable :disabled="editing">
              <el-option v-for="item in versions" :key="item.id"
                :label="item.projectName + ' / ' + item.versionNo" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="轮次名称" prop="cycleName">
            <el-input v-model.trim="form.cycleName" maxlength="128" placeholder="例如：本地开发自测 / test3 第一轮" />
          </el-form-item>
          <el-form-item label="测试阶段" prop="cycleStage">
            <el-select v-model="form.cycleStage" style="width:100%">
              <el-option v-for="item in stageOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="测试环境" prop="environmentId">
            <el-select v-model="form.environmentId" style="width:100%" filterable>
              <el-option v-for="item in environments" :key="item.id"
                :label="item.environmentName + ' (' + item.environmentCode + ')'" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="代码版本" prop="codeVersion">
            <el-input v-model.trim="form.codeVersion" maxlength="128" placeholder="例如 GS.202611.1-SNAPSHOT / v1.2.0" />
          </el-form-item>
          <el-form-item label="Git 分支">
            <el-input v-model.trim="form.gitBranch" maxlength="128" placeholder="例如 feature/xxx" />
          </el-form-item>
          <el-form-item label="Git Commit">
            <el-input v-model.trim="form.gitCommit" maxlength="64" placeholder="提交 SHA" />
          </el-form-item>
          <el-form-item label="构建编号">
            <el-input v-model.trim="form.buildNo" maxlength="128" placeholder="CI 构建号，可选" />
          </el-form-item>
        </div>
        <el-form-item v-if="!editing" label="测试用例" prop="caseIds">
          <el-select v-model="form.caseIds" multiple filterable clearable collapse-tags
            collapse-tags-tooltip style="width:100%" placeholder="选择本轮要执行的测试用例">
            <el-option v-for="item in testCases" :key="item.id"
              :label="item.caseNo + ' / ' + item.title" :value="item.id" />
          </el-select>
          <div class="form-tip">创建时自动固定每条用例的当前修订版本，以及本版本内关联的需求和最新详细设计。</div>
        </el-form-item>
        <el-form-item label="测试范围 JSON">
          <el-input v-model="form.scopeJson" type="textarea" :rows="2"
            placeholder='可选，例如：{"modules":["登录","订单"],"tags":["smoke"]}' />
        </el-form-item>
        <el-form-item label="轮次说明">
          <el-input v-model.trim="form.description" maxlength="2000" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCycle">
          {{ editing ? '保存轮次配置' : '创建轮次并生成快照' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" title="测试轮次详情" width="1120px" top="3vh" destroy-on-close>
      <template v-if="detail">
        <div class="cycle-detail-title">
          <div>
            <strong>第 {{ detail.cycleNo }} 轮 · {{ detail.cycleName }}</strong>
            <div class="secondary-cell">{{ detail.projectName }} / {{ detail.versionNo }}</div>
          </div>
          <el-tag :type="statusTag(detail.status)">{{ statusLabel(detail.status) }}</el-tag>
        </div>
        <div class="cycle-detail-grid">
          <div><label>测试环境</label><strong>{{ detail.environmentName }} ({{ detail.environmentCode }})</strong></div>
          <div><label>环境地址快照</label><strong>{{ environmentSnapshot.baseUrl || '未配置' }}</strong></div>
          <div><label>API 地址快照</label><strong>{{ environmentSnapshot.apiBaseUrl || '同环境地址' }}</strong></div>
          <div><label>认证配置快照</label><strong>{{ environmentSnapshot.authType || 'NONE' }} / {{ environmentSnapshot.credentialRef || '无凭据引用' }}</strong></div>
          <div v-if="environmentSnapshot.configJson"><label>非敏感参数快照</label><strong>{{ environmentSnapshot.configJson }}</strong></div>
          <div><label>代码版本</label><strong>{{ detail.codeVersion }}</strong></div>
          <div><label>Git 分支 / Commit</label><strong>{{ detail.gitBranch || '—' }} / {{ detail.gitCommit || '—' }}</strong></div>
          <div><label>构建编号</label><strong>{{ detail.buildNo || '—' }}</strong></div>
          <div><label>测试阶段</label><strong>{{ stageLabel(detail.cycleStage) }}</strong></div>
        </div>
        <div class="detail-section-heading">
          <strong>本轮测试用例（{{ detail.cases?.length || 0 }}）</strong>
          <div class="detail-actions">
            <el-button size="small" plain type="primary" @click="openReport(detail)">查看报告</el-button>
            <el-button size="small" plain @click="openReport(detail, true)">下载 HTML</el-button>
            <el-button v-if="detail.status === 'PLANNED'" size="small" plain type="primary" @click="openAddCases">增加用例</el-button>
            <el-button v-if="detail.status === 'RUNNING'" size="small" type="success" @click="createCycleExecution">创建整轮执行任务</el-button>
          </div>
        </div>
        <el-table :data="detail.cases || []" row-key="id" stripe>
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="snapshot-panel">
                <div class="snapshot-block"><label>前置条件</label><p>{{ caseSnapshot(row).preconditions || '无' }}</p></div>
                <div class="snapshot-block">
                  <label>测试步骤</label>
                  <div v-for="step in caseSnapshot(row).steps || []" :key="step.stepNo" class="snapshot-step">
                    <strong>{{ step.stepNo }}. {{ step.action }}</strong>
                    <p v-if="step.testData">操作数据：{{ step.testData }}</p>
                    <p>预期结果：{{ step.expectedResult }}</p>
                  </div>
                </div>
                <div class="snapshot-block"><label>整体预期结果</label><p>{{ caseSnapshot(row).expectedResult }}</p></div>
                <div v-if="caseSnapshot(row).aiInstruction" class="snapshot-block">
                  <label>ChatGPT 执行指令</label><p>{{ caseSnapshot(row).aiInstruction }}</p>
                </div>
                <div class="snapshot-block">
                  <label>需求覆盖快照</label>
                  <div v-if="row.requirements?.length" class="requirement-snapshots">
                    <div v-for="req in row.requirements" :key="req.id" class="requirement-snapshot">
                      <el-tag size="small">{{ req.requirementNo }} · {{ req.coverageType }}</el-tag>
                      <strong>{{ req.title }}</strong>
                      <p>{{ requirementSnapshot(req).contentMarkdown || '需求未填写正文' }}</p>
                      <div v-if="designSnapshot(req)" class="design-snapshot">
                        <label>详细设计 V{{ designSnapshot(req).revisionNo }} · {{ designSnapshot(req).title }}</label>
                        <p>{{ designSnapshot(req).contentMarkdown || '详细设计未填写正文' }}</p>
                      </div>
                    </div>
                  </div>
                  <p v-else>本轮版本下未关联需求（可作为通用回归用例执行）</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="用例编号 / 名称" min-width="230">
            <template #default="{ row }">
              <div class="primary-cell">{{ row.caseNo }}</div>
              <div>{{ row.title }}</div>
            </template>
          </el-table-column>
          <el-table-column label="快照版本" width="105">
            <template #default="{ row }">V{{ row.revisionNo }}</template>
          </el-table-column>
          <el-table-column label="执行方式" width="125">
            <template #default="{ row }">{{ executionModeLabel(row.executionMode) }}</template>
          </el-table-column>
          <el-table-column label="需求覆盖" min-width="190">
            <template #default="{ row }">{{ row.requirements?.length ? row.requirements.length + ' 项需求' : '未关联' }}</template>
          </el-table-column>
          <el-table-column label="最新结果" width="105">
            <template #default="{ row }"><el-tag size="small" :type="resultTag(row.latestResult)">{{ resultLabel(row.latestResult) }}</el-tag></template>
          </el-table-column>
          <el-table-column v-if="detail.status === 'RUNNING'" label="执行" width="120">
            <template #default="{ row }">
              <el-button link type="success" @click="createCaseExecution(row)">单独执行</el-button>
            </template>
          </el-table-column>
          <el-table-column v-if="detail.status === 'PLANNED'" label="操作" width="80">
            <template #default="{ row }"><el-button link type="danger" @click="removeCase(row)">移除</el-button></template>
          </el-table-column>
          <template #empty><el-empty description="当前轮次尚未选择测试用例" /></template>
        </el-table>
      </template>
      <template #footer>
        <el-button v-if="detail?.status === 'PLANNED'" type="success" @click="startCycle(detail)">开始测试</el-button>
        <el-button v-if="detail?.status === 'PLANNED' || detail?.status === 'RUNNING'" type="danger" plain @click="abortCycle(detail)">终止轮次</el-button>
        <el-button @click="detailDialog = false">关闭</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="addCasesDialog" title="增加测试用例" width="620px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="选择用例">
          <el-select v-model="addCaseIds" multiple filterable clearable collapse-tags
            collapse-tags-tooltip style="width:100%" placeholder="选择需要加入本轮的用例">
            <el-option v-for="item in addableCases" :key="item.id"
              :label="item.caseNo + ' / ' + item.title" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCasesDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAddedCases">加入本轮并固定当前修订</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElMessageBox, ElLoadingDirective as vLoading } from 'element-plus'
import { useRouter } from 'vue-router'
import { executionTaskApi } from '../api/executionTasks'
import { versionApi } from '../api/versions'
import { environmentApi } from '../api/environments'
import { testCaseApi } from '../api/testCases'
import { testCycleApi } from '../api/testCycles'

const router = useRouter()
const statusOptions = [
  { value: 'PLANNED', label: '计划中' }, { value: 'RUNNING', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' }, { value: 'ABORTED', label: '已终止' }
]
const stageOptions = [
  { value: 'LOCAL_DEV', label: '本地开发自测' },
  { value: 'INTEGRATION_TEST', label: '集成测试' },
  { value: 'REGRESSION', label: '回归测试' },
  { value: 'PRE_RELEASE', label: '发布前验证' },
  { value: 'PRODUCTION', label: '生产验证' }
]
const versions = ref([])
const environments = ref([])
const testCases = ref([])
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ versionId: null, environmentId: null, status: '', keyword: '' })
const editDialog = ref(false)
const editing = ref(false)
const editingId = ref(null)
const formRef = ref()
const form = reactive(emptyForm())
const detailDialog = ref(false)
const detail = ref(null)
const addCasesDialog = ref(false)
const addCaseIds = ref([])

function emptyForm() {
  return {
    versionId: null, cycleName: '', cycleStage: 'LOCAL_DEV', environmentId: null,
    codeVersion: '', gitBranch: '', gitCommit: '', buildNo: '',
    scopeJson: '', description: '', caseIds: [], createdBy: 'local-user'
  }
}
const rules = {
  versionId: [{ required: true, message: '请选择所属版本', trigger: 'change' }],
  cycleName: [{ required: true, message: '请输入轮次名称', trigger: 'blur' }],
  cycleStage: [{ required: true, message: '请选择测试阶段', trigger: 'change' }],
  environmentId: [{ required: true, message: '请选择测试环境', trigger: 'change' }],
  codeVersion: [{ required: true, message: '请输入本轮实际代码版本', trigger: 'blur' }],
  caseIds: [{ type: 'array', required: true, min: 1, message: '至少选择一条测试用例', trigger: 'change' }]
}
const addableCases = computed(() => {
  const existing = new Set((detail.value?.cases || []).map(item => item.testCaseId))
  return testCases.value.filter(item => !existing.has(item.id))
})
const environmentSnapshot = computed(() => parseJson(detail.value?.environmentSnapshotJson) || {})

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (error) { return null }
}
function caseSnapshot(row) { return parseJson(row.caseSnapshotJson) || {} }
function requirementSnapshot(row) { return parseJson(row.requirementSnapshotJson) || {} }
function designSnapshot(row) { return parseJson(row.designSnapshotJson) }

async function loadOptions() {
  const [versionResult, environmentResult] = await Promise.all([
    versionApi.page({ pageNum: 1, pageSize: 100 }),
    environmentApi.list({ activeOnly: true })
  ])
  versions.value = versionResult.list || []
  environments.value = environmentResult || []
  const firstPage = await testCaseApi.page({ status: 'ACTIVE', pageNum: 1, pageSize: 100 })
  testCases.value = firstPage.list || []
  let page = 2
  while (testCases.value.length < (firstPage.total || 0)) {
    const next = await testCaseApi.page({ status: 'ACTIVE', pageNum: page, pageSize: 100 })
    if (!next.list?.length) break
    testCases.value.push(...next.list)
    page += 1
  }
}

async function loadData() {
  loading.value = true
  try {
    const result = await testCycleApi.page({
      versionId: filters.versionId || undefined,
      environmentId: filters.environmentId || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value
    })
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) { ElMessage.error(error.message || '加载测试轮次失败') }
  finally { loading.value = false }
}
function search() { pageNum.value = 1; loadData() }
function resetFilters() {
  Object.assign(filters, { versionId: null, environmentId: null, status: '', keyword: '' })
  search()
}
function handleSizeChange() { pageNum.value = 1; loadData() }

function openCreate() {
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  editDialog.value = true
  formRef.value?.clearValidate()
}
async function openEdit(row) {
  try {
    const data = await testCycleApi.get(row.id)
    editing.value = true
    editingId.value = row.id
    Object.assign(form, {
      versionId: data.versionId,
      cycleName: data.cycleName,
      cycleStage: data.cycleStage,
      environmentId: data.environmentId,
      codeVersion: data.codeVersion,
      gitBranch: data.gitBranch || '',
      gitCommit: data.gitCommit || '',
      buildNo: data.buildNo || '',
      scopeJson: data.scopeJson || '',
      description: data.description || '',
      caseIds: [],
      createdBy: data.createdBy || 'local-user'
    })
    editDialog.value = true
    formRef.value?.clearValidate()
  } catch (error) { ElMessage.error(error.message || '读取测试轮次失败') }
}

async function saveCycle() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (form.scopeJson.trim()) {
    try {
      const parsed = JSON.parse(form.scopeJson)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('测试范围必须是 JSON 对象')
      }
    } catch (error) {
      ElMessage.warning(error.message || '测试范围 JSON 格式不正确')
      return
    }
  }
  saving.value = true
  try {
    const payload = {
      cycleName: form.cycleName.trim(),
      cycleStage: form.cycleStage,
      environmentId: form.environmentId,
      codeVersion: form.codeVersion.trim(),
      gitBranch: form.gitBranch.trim() || null,
      gitCommit: form.gitCommit.trim() || null,
      buildNo: form.buildNo.trim() || null,
      scopeJson: form.scopeJson.trim() || null,
      description: form.description.trim() || null
    }
    if (editing.value) {
      await testCycleApi.update(editingId.value, payload)
      ElMessage.success('测试轮次配置已更新')
    } else {
      await testCycleApi.create({
        ...payload,
        versionId: form.versionId,
        caseIds: [...form.caseIds],
        createdBy: form.createdBy || 'local-user'
      })
      ElMessage.success('测试轮次创建成功，已固定用例及需求快照')
    }
    editDialog.value = false
    await loadData()
  } catch (error) { ElMessage.error(error.message || '保存测试轮次失败') }
  finally { saving.value = false }
}

async function openDetail(row) {
  try {
    detail.value = await testCycleApi.get(row.id)
    detailDialog.value = true
  } catch (error) { ElMessage.error(error.message || '读取测试轮次详情失败') }
}
function openReport(row, download = false) {
  if (!row?.id) return
  const suffix = download ? '?download=true' : ''
  // 报告由后端直接返回 HTML；新窗口查看，下载模式由 Content-Disposition 处理。
  window.open(`/api/test-cycles/${row.id}/report${suffix}`, '_blank', 'noopener')
}
function createIdempotencyKey() {
  return 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}
async function createCycleExecution() {
  try {
    await ElMessageBox.confirm(
      '将为本轮所有测试用例创建执行子任务。已存在未完成任务时，系统会阻止重复创建。确定继续吗？',
      '创建整轮执行任务', { type: 'warning', confirmButtonText: '创建任务', cancelButtonText: '取消' }
    )
    await executionTaskApi.createCycle(detail.value.id, {
      idempotencyKey: createIdempotencyKey(), requestedBy: 'local-user', triggerSource: 'USER'
    })
    ElMessage.success('整轮执行任务已创建')
    detailDialog.value = false
    await loadData()
    router.push('/execution-tasks')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '创建整轮执行任务失败')
  }
}
async function createCaseExecution(row) {
  try {
    await executionTaskApi.createCase(detail.value.id, row.id, {
      idempotencyKey: createIdempotencyKey(), requestedBy: 'local-user', triggerSource: 'USER'
    })
    ElMessage.success('单用例执行任务已创建')
    detailDialog.value = false
    await loadData()
    router.push('/execution-tasks')
  } catch (error) { ElMessage.error(error.message || '创建单用例执行任务失败') }
}
function openAddCases() {
  addCaseIds.value = []
  addCasesDialog.value = true
}
async function saveAddedCases() {
  if (!addCaseIds.value.length) {
    ElMessage.warning('请至少选择一条测试用例')
    return
  }
  saving.value = true
  try {
    detail.value = await testCycleApi.addCases(detail.value.id, addCaseIds.value)
    addCasesDialog.value = false
    addCaseIds.value = []
    await loadData()
    ElMessage.success('测试用例已加入，本轮已固定当前修订及需求快照')
  } catch (error) { ElMessage.error(error.message || '加入测试用例失败') }
  finally { saving.value = false }
}
async function removeCase(row) {
  try {
    await ElMessageBox.confirm(
      '移除后，该用例不再属于当前计划中的测试轮次。此操作不会删除原测试用例。',
      '确认移除用例', { type: 'warning', confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
    detail.value = await testCycleApi.removeCase(detail.value.id, row.id)
    await loadData()
    ElMessage.success('已从本轮移除测试用例')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '移除用例失败')
  }
}
async function startCycle(row) {
  if (!row?.id) return
  try {
    await ElMessageBox.confirm(
      '开始后将锁定本轮用例清单，不再允许修改环境、代码版本或增删用例。确定开始测试吗？',
      '开始测试轮次', { type: 'warning', confirmButtonText: '开始测试', cancelButtonText: '再检查一下' }
    )
    const updated = await testCycleApi.start(row.id)
    if (detail.value?.id === row.id) detail.value = updated
    await loadData()
    ElMessage.success('测试轮次已开始')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '开始测试失败')
  }
}
async function abortCycle(row) {
  if (!row?.id) return
  try {
    await ElMessageBox.confirm(
      '终止后本轮不再接受执行操作。已有记录会保留，确定终止吗？',
      '终止测试轮次', { type: 'warning', confirmButtonText: '确认终止', cancelButtonText: '取消' }
    )
    const updated = await testCycleApi.abort(row.id)
    if (detail.value?.id === row.id) detail.value = updated
    await loadData()
    ElMessage.success('测试轮次已终止')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '终止测试轮次失败')
  }
}
function statusLabel(value) {
  return statusOptions.find(item => item.value === value)?.label || value || '—'
}
function statusTag(value) {
  return ({ PLANNED: 'info', RUNNING: 'warning', COMPLETED: 'success', ABORTED: 'danger' })[value] || 'info'
}
function stageLabel(value) {
  return stageOptions.find(item => item.value === value)?.label || value || '—'
}
function executionModeLabel(value) {
  return ({ MANUAL: '人工执行', SCRIPT: '固定脚本', AI: 'ChatGPT 动态执行' })[value] || value || '—'
}
function resultLabel(value) {
  return ({ NOT_RUN: '未执行', PASS: '通过', FAIL: '失败', BLOCKED: '阻塞', SKIPPED: '跳过' })[value] || value || '未执行'
}
function resultTag(value) {
  return ({ NOT_RUN: 'info', PASS: 'success', FAIL: 'danger', BLOCKED: 'warning', SKIPPED: '' })[value] || 'info'
}
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '—' }
onMounted(async () => {
  try {
    await loadOptions()
  } catch (error) {
    ElMessage.error(error.message || '加载版本、环境或测试用例选项失败')
  }
  await loadData()
})
</script>

<style scoped>
.result-counts { display: flex; flex-wrap: wrap; gap: 9px; font-size: 11px; }
.pass-count { color: #299b80; }
.fail-count { color: #d65d68; }
.blocked-count { color: #c58a36; }
.skipped-count { color: #7d8797; }
.cycle-detail-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.cycle-detail-title strong { color: #29364c; font-size: 15px; }
.cycle-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 15px; margin-bottom: 20px; background: #f8f9fc; border: 1px solid #edf0f5; border-radius: 10px; }
.cycle-detail-grid label, .cycle-detail-grid strong { display: block; overflow-wrap: anywhere; }
.cycle-detail-grid label { margin-bottom: 6px; color: #8b96a7; font-size: 10px; }
.cycle-detail-grid strong { color: #3d4b64; font-size: 11px; font-weight: 600; }
.detail-section-heading { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 12px; color: #34425b; font-size: 13px; }
.snapshot-panel { padding: 14px 20px; background: #fafbfe; }
.snapshot-block { margin-bottom: 15px; }
.snapshot-block > label { display: block; margin-bottom: 7px; color: #52617a; font-size: 11px; font-weight: 700; }
.snapshot-block p { margin: 4px 0; color: #68758a; font-size: 11px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.snapshot-step { padding: 9px 11px; margin: 7px 0; border: 1px solid #edf0f5; border-radius: 7px; background: white; }
.snapshot-step strong { color: #3d4b64; font-size: 11px; }
.requirement-snapshots { display: flex; flex-direction: column; gap: 10px; }
.requirement-snapshot { padding: 11px 12px; background: white; border: 1px solid #edf0f5; border-radius: 8px; }
.requirement-snapshot > strong { margin-left: 8px; color: #3d4b64; font-size: 11px; }
.requirement-snapshot > p, .design-snapshot p { margin: 8px 0 0; color: #68758a; font-size: 11px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.design-snapshot { margin-top: 10px; padding: 10px; background: #f8f9fc; border-radius: 7px; }
.design-snapshot label { color: #52617a; font-size: 10px; font-weight: 700; }
@media (max-width: 760px) {
  .cycle-detail-grid { grid-template-columns: 1fr 1fr; }
  .cycle-detail-title { align-items: flex-start; gap: 12px; }
}
</style>
