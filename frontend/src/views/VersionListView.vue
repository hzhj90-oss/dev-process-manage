<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">RELEASE PLANNING</div>
        <h1>版本管理</h1>
        <p>一个项目可以包含多个版本；每个版本后续可以建立多个需求和测试轮次。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增版本</el-button>
    </div>

    <el-alert v-if="projectsError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'项目下拉选项加载失败：' + projectsError">
      <el-button link type="primary" @click="loadProjects">重试加载项目</el-button>
    </el-alert>
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-select v-model="filters.projectId" clearable filterable placeholder="全部项目" class="filter-project">
          <el-option v-for="item in projects" :key="item.id"
            :label="item.projectCode + ' · ' + item.projectName" :value="item.id" />
        </el-select>
        <el-input v-model="filters.keyword" clearable placeholder="搜索版本号、版本名称或项目"
          class="filter-keyword" @keyup.enter="search" />
        <el-select v-model="filters.status" clearable placeholder="版本状态" class="filter-status">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-alert v-if="listError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'版本列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div>
          <strong>版本列表</strong>
          <span class="muted-count">共 {{ total }} 个版本</span>
        </div>
        <el-button text @click="loadData"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" row-key="id" empty-text="暂无版本，请先创建项目，再新增版本">
        <el-table-column label="所属项目" min-width="180">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.projectCode }}</div>
            <div class="secondary-cell">{{ row.projectName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="版本" min-width="180">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.versionNo }}</div>
            <div class="secondary-cell">{{ row.versionName || '未命名版本' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="115" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="light">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划开始" width="125">
          <template #default="{ row }">{{ row.plannedStartDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="计划发布" width="125">
          <template #default="{ row }">{{ row.plannedReleaseDate || '—' }}</template>
        </el-table-column>
        <el-table-column prop="requirementCount" label="需求" width="80" align="center" />
        <el-table-column prop="cycleCount" label="测试轮次" width="95" align="center" />
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="225" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goRequirements(row)">查看需求</el-button>
            <el-button link type="primary" @click="goCycles(row)">测试轮次</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData" @size-change="handleSizeChange" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑版本' : '新增版本'" width="680px"
      @close="invalidateEditor" :close-on-click-modal="!saving"
      :close-on-press-escape="!saving" :show-close="!saving">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="115px" :disabled="saving || projectsLoading || !!projectsError">
        <el-form-item label="所属项目" prop="projectId">
          <el-select v-model="form.projectId" filterable placeholder="请选择项目" style="width: 100%">
            <el-option v-for="item in projectEditOptions" :key="item.id"
              :label="item.projectCode + ' · ' + item.projectName" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本号" prop="versionNo">
          <el-input v-model.trim="form.versionNo" maxlength="64" placeholder="例如：GS.2026.11.1" />
        </el-form-item>
        <el-form-item label="版本名称">
          <el-input v-model.trim="form.versionName" maxlength="128" placeholder="可选，例如：11月迭代版本" />
        </el-form-item>
        <el-form-item label="版本状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <div class="form-two-columns">
          <el-form-item label="计划开始">
            <el-date-picker v-model="form.plannedStartDate" type="date" value-format="YYYY-MM-DD"
              placeholder="选择开始日期" style="width: 100%" />
          </el-form-item>
          <el-form-item label="计划发布">
            <el-date-picker v-model="form.plannedReleaseDate" type="date" value-format="YYYY-MM-DD"
              placeholder="选择发布日期" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="版本说明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="版本范围、交付说明或备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving"
          :disabled="saving || projectsLoading || !!projectsError" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDatePicker, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import { contextId, contextLink } from '../utils/contextNavigation'
import { projectApi } from '../api/projects'
import { versionApi } from '../api/versions'
import { createLatestRequest } from '../utils/latestRequest'
import { loadPagedOptions } from '../utils/pagedOptions'

const router = useRouter()
const route = useRoute()
const listGate = createLatestRequest()
const listError = ref('')
const statusOptions = [
  { value: 'PLANNING', label: '规划中' },
  { value: 'DEVELOPING', label: '开发中' },
  { value: 'TESTING', label: '测试中' },
  { value: 'RELEASED', label: '已发布' },
  { value: 'ARCHIVED', label: '已归档' }
]
const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const projects = ref([])
const projectsError = ref('')
const projectsLoading = ref(false)
const projectsGate = createLatestRequest()
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ projectId: null, keyword: '', status: '' })
const dialogVisible = ref(false)
const editing = ref(false)
const editingId = ref(null)
const editorGate = createLatestRequest()
const editorToken = ref(null)
const originalProject = ref(null)
const projectEditOptions = computed(() => {
  const source = projects.value
  const item = originalProject.value
  return editing.value && item && !source.some(row => row.id === item.id)
    ? [item, ...source] : source
})
const formRef = ref()

const emptyForm = () => ({
  projectId: filters.projectId || null,
  versionNo: '',
  versionName: '',
  status: 'PLANNING',
  plannedStartDate: '',
  plannedReleaseDate: '',
  description: ''
})
const form = reactive(emptyForm())
const rules = {
  projectId: [{ required: true, message: '请选择所属项目', trigger: 'change' }],
  versionNo: [{ required: true, message: '请输入版本号', trigger: 'blur' }]
}

async function loadProjects() {
  const token = projectsGate.begin()
  projectsLoading.value = true
  projectsError.value = ''
  try {
    const loaded = await loadPagedOptions(projectApi.page, { status: 'ACTIVE' })
    if (projectsGate.isCurrent(token)) projects.value = loaded
  } catch (error) {
    if (!projectsGate.isCurrent(token)) return
    projects.value = []
    projectsError.value = error.message || '项目选项加载失败，请重试'
  } finally {
    if (projectsGate.isCurrent(token)) projectsLoading.value = false
  }
}

async function loadData() {
  const requestId = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await versionApi.page({
      projectId: filters.projectId || undefined,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value
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
function goRequirements(row) {
  const target = contextLink('requirements', 'versionId', row?.id)
  if (target) router.push(target)
}
function goCycles(row) {
  const target = contextLink('test-cycles', 'versionId', row?.id)
  if (target) router.push(target)
}
function search() {
  pageNum.value = 1
  loadData()
}

function resetFilters() {
  filters.projectId = null
  filters.keyword = ''
  filters.status = ''
  search()
}

function invalidateEditor() {
  editorGate.invalidate()
  editorToken.value = null
}
function openCreate() {
  if (saving.value) return
  if (projectsLoading.value || projectsError.value) {
    ElMessage.warning('项目选项尚未完整加载，请重试后新建版本')
    return
  }
  if (!projects.value.length) {
    ElMessage.warning('请先在项目管理中创建一个启用的项目')
    return
  }
  editorToken.value = editorGate.begin()
  editing.value = false
  editingId.value = null
  originalProject.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(row) {
  if (saving.value || !Number.isSafeInteger(Number(row?.id)) || Number(row.id) <= 0) return
  editorToken.value = editorGate.begin()
  editing.value = true
  editingId.value = Number(row.id)
  // Existing versions can belong to inactive projects; keep the original
  // project visible while offering only active projects as alternatives.
  originalProject.value = {
    id: row.projectId, projectCode: row.projectCode, projectName: row.projectName
  }
  Object.assign(form, {
    projectId: row.projectId,
    versionNo: row.versionNo,
    versionName: row.versionName || '',
    status: row.status,
    plannedStartDate: row.plannedStartDate || '',
    plannedReleaseDate: row.plannedReleaseDate || '',
    description: row.description || ''
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function save() {
  if (saving.value || !formRef.value || !dialogVisible.value
      || projectsLoading.value || projectsError.value) return
  const session = editorToken.value
  if (!session || !editorGate.isCurrent(session)) return
  const wasEditing = editing.value
  const targetId = editingId.value
  saving.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid || !dialogVisible.value || !editorGate.isCurrent(session)
        || projectsLoading.value || projectsError.value) return
    if (wasEditing && (!Number.isSafeInteger(targetId) || targetId <= 0)) {
      throw new Error('编辑目标已失效，请重新打开版本')
    }
    if (!projectEditOptions.value.some(item => item.id === form.projectId)) {
      throw new Error('所属项目选项已失效，请重新加载')
    }
    if (form.plannedStartDate && form.plannedReleaseDate &&
        form.plannedStartDate > form.plannedReleaseDate) {
      ElMessage.warning('计划开始日期不能晚于计划发布日期')
      return
    }
    const payload = { ...form }
    if (wasEditing) await versionApi.update(targetId, payload)
    else await versionApi.create(payload)
    if (editorGate.isCurrent(session)) {
      ElMessage.success(wasEditing ? '版本更新成功' : '版本创建成功')
      dialogVisible.value = false
      await Promise.all([loadData(), loadProjects()])
    }
  } catch (error) {
    if (editorGate.isCurrent(session)) ElMessage.error(error.message || '保存版本失败')
  } finally {
    saving.value = false
  }
}

function statusLabel(value) {
  return statusOptions.find(item => item.value === value)?.label || value
}

function statusType(value) {
  return ({ PLANNING: 'info', DEVELOPING: '', TESTING: 'warning',
    RELEASED: 'success', ARCHIVED: 'info' })[value] || 'info'
}

function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—'
}

function handleSizeChange() {
  pageNum.value = 1
  loadData()
}

watch(() => route.query.projectId, value => {
  const id = contextId(value)
  if (filters.projectId === id) return
  filters.projectId = id
  pageNum.value = 1
  loadData()
})
onMounted(async () => {
  filters.projectId = contextId(route.query.projectId)
  await Promise.all([loadProjects(), loadData()])
})
onUnmounted(() => {
  listGate.invalidate()
  projectsGate.invalidate()
  editorGate.invalidate()
})
</script>