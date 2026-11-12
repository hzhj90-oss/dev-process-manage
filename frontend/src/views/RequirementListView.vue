<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">REQUIREMENTS & DESIGN</div>
        <h1>需求与详细设计</h1>
        <p>需求归属到版本；详细设计采用修订版本保存，历史版本不会被覆盖。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增需求</el-button>
    </div>

    <el-alert v-if="versionsError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'版本下拉选项加载失败：' + versionsError">
      <el-button link type="primary" @click="loadVersions">重试加载版本</el-button>
    </el-alert>
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-select v-model="filters.versionId" clearable filterable placeholder="全部版本" class="filter-project">
          <el-option v-for="item in versions" :key="item.id" :value="item.id"
            :label="item.projectCode + ' · ' + item.versionNo" />
        </el-select>
        <el-input v-model="filters.keyword" clearable placeholder="需求编号、标题或项目"
          class="filter-keyword" @keyup.enter="search" />
        <el-select v-model="filters.status" clearable placeholder="需求状态" class="filter-status">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.priority" clearable placeholder="优先级" class="filter-status">
          <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-alert v-if="listError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'需求列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>需求列表</strong><span class="muted-count">共 {{ total }} 条需求</span></div>
        <el-button text @click="loadData">刷新</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" row-key="id" empty-text="暂无需求，请先选择版本并新增需求">
        <el-table-column label="所属版本" min-width="150">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.projectCode }} · {{ row.versionNo }}</div>
            <div class="secondary-cell">{{ row.projectName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="需求" min-width="220">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.requirementNo }}</div>
            <div class="secondary-cell">{{ row.title }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="requirementType" label="类型" width="110">
          <template #default="{ row }">{{ typeLabel(row.requirementType) }}</template>
        </el-table-column>
        <el-table-column label="优先级" width="90" align="center">
          <template #default="{ row }"><el-tag :type="priorityType(row.priority)" effect="light">{{ priorityLabel(row.priority) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="105" align="center">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" effect="light">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="详细设计" width="110" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDesigns(row)">
              {{ row.designCount || 0 }} 版
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="关联用例" width="110" align="center">
          <template #default="{ row }">
            <el-button link type="primary"
              :title="'查看需求 ' + row.requirementNo + ' 的关联测试用例'"
              @click="goRequirementCases(row)">{{ row.linkedCaseCount || 0 }} 条</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="ownerName" label="负责人" width="100" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openDesigns(row)">设计</el-button>
            <el-button link type="success" @click="goCreateRequirementCase(row)">新增用例</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData" @size-change="handleSizeChange" />
      </div>
    </el-card>

    <el-dialog v-model="requirementDialog" :title="editing ? '编辑需求' : '新增需求'" width="760px"
      @close="invalidateRequirementEditor" :close-on-click-modal="!saving"
      :close-on-press-escape="!saving" :show-close="!saving">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="105px"
        :disabled="saving || versionsLoading || !!versionsError">
        <el-form-item label="所属版本" prop="versionId">
          <el-select v-model="form.versionId" filterable :disabled="editing" placeholder="请选择版本" style="width:100%">
            <el-option v-for="item in versions" :key="item.id" :value="item.id"
              :label="item.projectCode + ' · ' + item.versionNo + ' ' + (item.versionName || '')" />
          </el-select>
        </el-form-item>
        <div class="form-two-columns">
          <el-form-item label="需求编号" prop="requirementNo">
            <el-input v-model.trim="form.requirementNo" maxlength="64" placeholder="例如：REQ-001" />
          </el-form-item>
          <el-form-item label="需求类型">
            <el-select v-model="form.requirementType" clearable style="width:100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="需求标题" prop="title">
          <el-input v-model.trim="form.title" maxlength="255" placeholder="简明描述需求目标" />
        </el-form-item>
        <div class="form-two-columns">
          <el-form-item label="优先级">
            <el-select v-model="form.priority" style="width:100%">
              <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="需求状态">
            <el-select v-model="form.status" style="width:100%">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-two-columns">
          <el-form-item label="负责人">
            <el-input v-model.trim="form.ownerName" maxlength="64" placeholder="可选" />
          </el-form-item>
          <el-form-item label="排序值">
            <el-input-number v-model="form.sortOrder" :min="0" :max="99999" style="width:100%" />
          </el-form-item>
        </div>
        <el-form-item label="需求内容">
          <el-input v-model="form.contentMarkdown" type="textarea" :rows="8"
            placeholder="使用 Markdown 记录背景、目标、业务规则和验收标准" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="requirementDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving"
          :disabled="versionsLoading || !!versionsError" @click="saveRequirement">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="designDialog" :title="selectedRequirement ? selectedRequirement.requirementNo + ' · 详细设计' : '详细设计'"
      width="1000px" top="5vh" @close="invalidateDesign"
      :close-on-click-modal="!designSaving" :close-on-press-escape="!designSaving" :show-close="!designSaving">
      <el-alert v-if="designError" type="error" show-icon :closable="false"
        :title="'详细设计加载失败：' + designError">
        <el-button link type="primary" @click="retryDesigns">重试加载详细设计</el-button>
      </el-alert>
      <div class="design-layout" v-loading="designLoading">
        <div class="design-history">
          <div class="design-history-head">
            <strong>设计修订</strong>
            <el-button size="small" type="primary" :disabled="designLoading || !!designError || designSaving"
              @click="openNewDesign">新增修订</el-button>
          </div>
          <el-empty v-if="!designLoading && !designError && !designs.length" description="暂无详细设计" :image-size="65" />
          <button v-for="item in designs" :key="item.id"
            class="design-revision" :class="{ selected: selectedDesign && selectedDesign.id === item.id }"
            @click="selectDesign(item)">
            <strong>V{{ item.revisionNo }} · {{ item.title }}</strong>
            <span>{{ designStatusLabel(item.status) }} · {{ formatDate(item.createdAt) }}</span>
          </button>
        </div>
        <div class="design-preview">
          <template v-if="selectedDesign">
            <div class="design-preview-head">
              <div>
                <div class="eyebrow">REVISION V{{ selectedDesign.revisionNo }}</div>
                <h3>{{ selectedDesign.title }}</h3>
                <span class="secondary-cell">{{ designTypeLabel(selectedDesign.designType) }} · {{ designStatusLabel(selectedDesign.status) }} · {{ selectedDesign.authorName || '未填写作者' }}</span>
              </div>
            </div>
            <pre class="design-markdown">{{ selectedDesign.contentMarkdown }}</pre>
            <div v-if="selectedDesign.attachmentPath" class="attachment-path">附件：{{ selectedDesign.attachmentPath }}</div>
          </template>
          <el-empty v-else description="选择左侧修订版本，或新增详细设计" />
        </div>
      </div>
      <template #footer><el-button :disabled="designSaving" @click="designDialog = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="newDesignDialog" title="新增详细设计修订" width="760px" append-to-body
      @close="invalidateNewDesign" :close-on-click-modal="!designSaving"
      :close-on-press-escape="!designSaving" :show-close="!designSaving">
      <el-alert title="保存后将生成新的修订版本，既有设计版本不会被覆盖。" type="info" :closable="false" class="design-alert" />
      <el-form ref="designFormRef" :model="designForm" :rules="designRules" label-width="105px" :disabled="designSaving">
        <div class="form-two-columns">
          <el-form-item label="设计类型">
            <el-select v-model="designForm.designType" style="width:100%">
              <el-option v-for="item in designTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="设计状态">
            <el-select v-model="designForm.status" style="width:100%">
              <el-option v-for="item in designStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="设计标题" prop="title">
          <el-input v-model.trim="designForm.title" maxlength="255" placeholder="例如：后端详细设计 V2" />
        </el-form-item>
        <el-form-item label="作者">
          <el-input v-model.trim="designForm.authorName" maxlength="64" placeholder="可选" />
        </el-form-item>
        <el-form-item label="设计内容" prop="contentMarkdown">
          <el-input v-model="designForm.contentMarkdown" type="textarea" :rows="14"
            placeholder="使用 Markdown 记录接口、数据结构、流程、异常处理和影响范围" />
        </el-form-item>
        <el-form-item label="附件路径">
          <el-input v-model.trim="designForm.attachmentPath" maxlength="512" placeholder="可选，填写本地附件相对路径" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="designSaving" @click="newDesignDialog = false">取消</el-button>
        <el-button type="primary" :loading="designSaving" :disabled="designLoading || !!designError"
          @click="saveDesign">保存新修订</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contextLink } from '../utils/contextNavigation'
import { contextId } from '../utils/contextNavigation'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { versionApi } from '../api/versions'
import { requirementApi } from '../api/requirements'
import { createLatestRequest } from '../utils/latestRequest'
import { loadPagedOptions } from '../utils/pagedOptions'

const route = useRoute()
const router = useRouter()
function goRequirementCases(row) {
  const target = contextLink('test-cases', 'requirementId', row?.id)
  if (target) router.push(target)
}
function goCreateRequirementCase(row) {
  const target = contextLink('test-cases', 'requirementId', row?.id)
  if (target) router.push({ ...target, query: { ...target.query, create: '1' } })
}
const listGate = createLatestRequest()
const listError = ref('')
const statusOptions = [
  { value: 'DRAFT', label: '草稿' }, { value: 'CONFIRMED', label: '已确认' },
  { value: 'DEVELOPING', label: '开发中' }, { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' }
]
const priorityOptions = [
  { value: 'LOW', label: '低' }, { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' }, { value: 'URGENT', label: '紧急' }
]
const typeOptions = [
  { value: 'FEATURE', label: '功能需求' }, { value: 'BUG', label: '缺陷' },
  { value: 'OPTIMIZATION', label: '优化' }, { value: 'TECH_DEBT', label: '技术改造' },
  { value: 'OTHER', label: '其他' }
]
const designTypeOptions = [
  { value: 'GENERAL', label: '综合设计' }, { value: 'API', label: '接口设计' },
  { value: 'DATABASE', label: '数据库设计' }, { value: 'CODE', label: '代码设计' },
  { value: 'UI', label: '页面设计' }, { value: 'TEST', label: '测试设计' }
]
const designStatusOptions = [
  { value: 'DRAFT', label: '草稿' }, { value: 'IN_REVIEW', label: '评审中' },
  { value: 'APPROVED', label: '已确认' }, { value: 'REJECTED', label: '已驳回' },
  { value: 'SUPERSEDED', label: '已被新版本替代' }
]
const loading = ref(false)
const saving = ref(false)
const requirementEditorGate = createLatestRequest()
const requirementEditorToken = ref(null)
const versionsGate = createLatestRequest()
const versionsLoading = ref(false)
const designSaving = ref(false)
const designGate = createLatestRequest()
const designToken = ref(null)
const designLoading = ref(false)
const designError = ref('')
const newDesignRequirementId = ref(null)
const rows = ref([])
const versions = ref([])
const versionsError = ref('')
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ versionId: null, keyword: '', status: '', priority: '' })
const requirementDialog = ref(false)
const designDialog = ref(false)
const newDesignDialog = ref(false)
const editing = ref(false)
const editingId = ref(null)
const formRef = ref()
const designFormRef = ref()
const selectedRequirement = ref(null)
const designs = ref([])
const selectedDesign = ref(null)

const emptyForm = () => ({
  versionId: filters.versionId || null, requirementNo: '', title: '',
  requirementType: '', contentMarkdown: '', status: 'DRAFT',
  priority: 'MEDIUM', ownerName: '', sortOrder: 0
})
const form = reactive(emptyForm())
const designForm = reactive({
  designType: 'GENERAL', title: '', contentMarkdown: '',
  attachmentPath: '', status: 'DRAFT', authorName: ''
})
const rules = {
  versionId: [{ required: true, message: '请选择所属版本', trigger: 'change' }],
  requirementNo: [{ required: true, message: '请输入需求编号', trigger: 'blur' }],
  title: [{ required: true, message: '请输入需求标题', trigger: 'blur' }]
}
const designRules = {
  title: [{ required: true, message: '请输入设计标题', trigger: 'blur' }],
  contentMarkdown: [{ required: true, message: '请输入详细设计内容', trigger: 'blur' }]
}

async function loadVersions() {
  const token = versionsGate.begin()
  versionsLoading.value = true
  versionsError.value = ''
  try {
    const result = await loadPagedOptions(versionApi.page)
    if (versionsGate.isCurrent(token)) versions.value = result
  } catch (error) {
    if (!versionsGate.isCurrent(token)) return
    versions.value = []
    versionsError.value = error.message || '版本选项加载失败，请重试'
  } finally {
    if (versionsGate.isCurrent(token)) versionsLoading.value = false
  }
}

async function loadData() {
  const requestId = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await requirementApi.page({
      versionId: filters.versionId || undefined,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
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
  filters.versionId = null
  filters.keyword = ''
  filters.status = ''
  filters.priority = ''
  search()
}
function invalidateRequirementEditor() {
  requirementEditorGate.invalidate()
  requirementEditorToken.value = null
}
function openCreate() {
  if (saving.value) return
  if (versionsLoading.value || versionsError.value || !versions.value.length) {
    ElMessage.warning('请先完整加载版本选项，或创建一个版本')
    return
  }
  requirementEditorToken.value = requirementEditorGate.begin()
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  requirementDialog.value = true
  formRef.value?.clearValidate()
}
function openEdit(row) {
  if (saving.value) return
  requirementEditorToken.value = requirementEditorGate.begin()
  editing.value = true
  editingId.value = row.id
  Object.assign(form, {
    versionId: row.versionId, requirementNo: row.requirementNo, title: row.title,
    requirementType: row.requirementType || '', contentMarkdown: row.contentMarkdown || '',
    status: row.status, priority: row.priority, ownerName: row.ownerName || '',
    sortOrder: row.sortOrder || 0
  })
  requirementDialog.value = true
  formRef.value?.clearValidate()
}
async function saveRequirement() {
  if (saving.value) return
  const token = requirementEditorToken.value
  const id = editingId.value
  const isEdit = editing.value
  if (!requirementDialog.value || !token || !requirementEditorGate.isCurrent(token)
      || versionsLoading.value || versionsError.value || !versions.value.length) return
  // Lock before async validation: rapid clicks must never create duplicate requirements.
  saving.value = true
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid || !requirementEditorGate.isCurrent(token) || !requirementDialog.value
        || editing.value !== isEdit || editingId.value !== id) return
    const payload = { ...form }
    if (isEdit) await requirementApi.update(id, payload)
    else await requirementApi.create(payload)
    if (!requirementEditorGate.isCurrent(token) || !requirementDialog.value) return
    ElMessage.success(isEdit ? '需求更新成功' : '需求创建成功')
    requirementDialog.value = false
    await loadData()
  } catch (error) {
    if (requirementEditorGate.isCurrent(token)) ElMessage.error(error.message || '保存需求失败')
  } finally {
    saving.value = false
  }
}
function invalidateDesign() {
  designGate.invalidate()
  designToken.value = null
  designLoading.value = false
  designError.value = ''
  if (!designSaving.value) {
    newDesignDialog.value = false
    newDesignRequirementId.value = null
  }
}
function retryDesigns() {
  if (designDialog.value && selectedRequirement.value && !designSaving.value) {
    void openDesigns(selectedRequirement.value)
  }
}
async function openDesigns(row) {
  if (designSaving.value) return
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = designGate.begin()
  designToken.value = token
  selectedRequirement.value = { ...row, id }
  selectedDesign.value = null
  designs.value = []
  designError.value = ''
  designLoading.value = true
  newDesignDialog.value = false
  newDesignRequirementId.value = null
  designDialog.value = true
  try {
    const list = await requirementApi.designs(id)
    if (!designGate.isCurrent(token) || !designDialog.value
        || selectedRequirement.value?.id !== id) return
    if (!Array.isArray(list)) throw new Error('详细设计列表响应格式异常')
    designs.value = list
    selectedDesign.value = list[0] || null
  } catch (error) {
    if (designGate.isCurrent(token) && designDialog.value) {
      designError.value = error.message || '读取详细设计失败'
    }
  } finally {
    if (designGate.isCurrent(token)) designLoading.value = false
  }
}
function selectDesign(item) {
  if (!designLoading.value && !designError.value && designDialog.value) {
    selectedDesign.value = item
  }
}
function invalidateNewDesign() {
  if (!designSaving.value) newDesignRequirementId.value = null
}
function openNewDesign() {
  if (!designDialog.value || !selectedRequirement.value || designLoading.value
      || designError.value || designSaving.value || !designGate.isCurrent(designToken.value)) {
    ElMessage.warning('请先完成当前需求的详细设计加载')
    return
  }
  newDesignRequirementId.value = selectedRequirement.value.id
  Object.assign(designForm, {
    designType: 'GENERAL', title: '', contentMarkdown: '',
    attachmentPath: '', status: 'DRAFT', authorName: ''
  })
  newDesignDialog.value = true
}
async function saveDesign() {
  if (designSaving.value || !designDialog.value || !newDesignDialog.value
      || designLoading.value || designError.value || !selectedRequirement.value
      || !newDesignRequirementId.value
      || selectedRequirement.value.id !== newDesignRequirementId.value) return
  const session = designToken.value
  const requirementId = newDesignRequirementId.value
  if (!designGate.isCurrent(session)) return
  // A revision is immutable: lock before asynchronous validation to avoid duplicates.
  designSaving.value = true
  try {
    const valid = await designFormRef.value?.validate().catch(() => false)
    if (!valid || !designGate.isCurrent(session) || !designDialog.value
        || !newDesignDialog.value || selectedRequirement.value?.id !== requirementId
        || newDesignRequirementId.value !== requirementId) return
    const created = await requirementApi.createDesign(requirementId, { ...designForm })
    if (designGate.isCurrent(session) && designDialog.value
        && selectedRequirement.value?.id === requirementId) {
      designs.value.unshift(created)
      selectedDesign.value = created
      newDesignDialog.value = false
      ElMessage.success('已创建新的详细设计修订')
      await loadData()
    }
  } catch (error) {
    if (designGate.isCurrent(session)) ElMessage.error(error.message || '保存详细设计修订失败')
  } finally {
    designSaving.value = false
  }
}
function statusLabel(value) { return statusOptions.find(x => x.value === value)?.label || value || '—' }
function statusType(value) {
  return ({ DRAFT: 'info', CONFIRMED: 'success', DEVELOPING: 'warning',
    COMPLETED: 'success', CANCELLED: 'danger' })[value] || 'info'
}
function priorityLabel(value) { return priorityOptions.find(x => x.value === value)?.label || value || '—' }
function priorityType(value) {
  return ({ LOW: 'info', MEDIUM: '', HIGH: 'warning', URGENT: 'danger' })[value] || 'info'
}
function typeLabel(value) { return typeOptions.find(x => x.value === value)?.label || value || '—' }
function designTypeLabel(value) { return designTypeOptions.find(x => x.value === value)?.label || value || '综合设计' }
function designStatusLabel(value) { return designStatusOptions.find(x => x.value === value)?.label || value || '草稿' }
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '—' }
function handleSizeChange() { pageNum.value = 1; loadData() }

watch(() => route.query.versionId, value => {
  const id = contextId(value)
  if (filters.versionId === id) return
  filters.versionId = id
  pageNum.value = 1
  loadData()
})
onMounted(async () => {
  filters.versionId = contextId(route.query.versionId)
  await loadVersions()
  await loadData()
})
onUnmounted(() => {
  listGate.invalidate()
  versionsGate.invalidate()
  requirementEditorGate.invalidate()
  designGate.invalidate()
})
</script>
