<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">PROJECT WORKSPACE</div>
        <h1>项目管理</h1>
        <p>维护代码项目及仓库信息，版本必须归属到一个项目。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增项目</el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filters.keyword" clearable placeholder="搜索项目编码或名称"
          class="filter-keyword" @keyup.enter="loadData" />
        <el-select v-model="filters.status" clearable placeholder="项目状态" class="filter-status">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-alert v-if="listError" type="error" show-icon :closable="false" class="list-error-alert"
      :title="'项目列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div>
          <strong>项目列表</strong>
          <span class="muted-count">共 {{ total }} 个项目</span>
        </div>
        <el-button text @click="loadData"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" row-key="id" empty-text="暂无项目，请先新增项目">
        <el-table-column prop="projectCode" label="项目编码" min-width="150" />
        <el-table-column prop="projectName" label="项目名称" min-width="180" />
        <el-table-column label="代码仓库" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.repositoryUrl" class="repo-link" :href="row.repositoryUrl" target="_blank" rel="noreferrer">{{ row.repositoryUrl }}</a>
            <span v-else class="muted">未配置</span>
          </template>
        </el-table-column>
        <el-table-column prop="mainBranch" label="主分支" width="120">
          <template #default="{ row }">{{ row.mainBranch || '—' }}</template>
        </el-table-column>
        <el-table-column prop="versionCount" label="版本数" width="90" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="light">
              {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="185" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goVersions(row)">查看版本</el-button>
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

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑项目' : '新增项目'" width="650px"
      @close="invalidateEditor" :close-on-click-modal="!saving"
      :close-on-press-escape="!saving" :show-close="!saving">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="105px" :disabled="saving">
        <el-form-item label="项目编码" prop="projectCode">
          <el-input v-model.trim="form.projectCode" maxlength="64" show-word-limit
            placeholder="例如：SPV-GS" :disabled="editing" />
        </el-form-item>
        <el-form-item label="项目名称" prop="projectName">
          <el-input v-model.trim="form.projectName" maxlength="128" show-word-limit placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="代码仓库" prop="repositoryUrl">
          <el-input v-model.trim="form.repositoryUrl" maxlength="512" placeholder="Git 仓库地址，可选" />
        </el-form-item>
        <el-form-item label="主分支" prop="mainBranch">
          <el-input v-model.trim="form.mainBranch" maxlength="128" placeholder="例如：main / develop" />
        </el-form-item>
        <el-form-item label="项目状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ACTIVE">启用</el-radio>
            <el-radio value="INACTIVE">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="项目说明">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="1000"
            show-word-limit placeholder="项目范围或补充说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElPagination, ElRadio, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { contextLink } from '../utils/contextNavigation'
import { projectApi } from '../api/projects'
import { createLatestRequest } from '../utils/latestRequest'

const router = useRouter()
const listGate = createLatestRequest()
const listError = ref('')
const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', status: '' })
const dialogVisible = ref(false)
const editing = ref(false)
const editingId = ref(null)
const editorGate = createLatestRequest()
const editorToken = ref(null)
const formRef = ref()

const emptyForm = () => ({
  projectCode: '', projectName: '', repositoryUrl: '',
  mainBranch: 'main', status: 'ACTIVE', description: ''
})
const form = reactive(emptyForm())
const rules = {
  projectCode: [{ required: true, message: '请输入项目编码', trigger: 'blur' }],
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }]
}

async function loadData() {
  const requestId = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await projectApi.page({
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

function goVersions(row) {
  const target = contextLink('versions', 'projectId', row?.id)
  if (target) router.push(target)
}

function search() {
  pageNum.value = 1
  loadData()
}

function resetFilters() {
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
  editorToken.value = editorGate.begin()
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(row) {
  if (saving.value || !Number.isSafeInteger(Number(row?.id)) || Number(row.id) <= 0) return
  editorToken.value = editorGate.begin()
  editing.value = true
  editingId.value = Number(row.id)
  Object.assign(form, {
    projectCode: row.projectCode,
    projectName: row.projectName,
    repositoryUrl: row.repositoryUrl || '',
    mainBranch: row.mainBranch || '',
    status: row.status,
    description: row.description || ''
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function save() {
  if (saving.value || !formRef.value || !dialogVisible.value) return
  const session = editorToken.value
  if (!session || !editorGate.isCurrent(session)) return
  const wasEditing = editing.value
  const targetId = editingId.value
  // Lock immediately, including during async form validation, to avoid double submits.
  saving.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid || !dialogVisible.value || !editorGate.isCurrent(session)) return
    if (wasEditing && (!Number.isSafeInteger(targetId) || targetId <= 0)) {
      throw new Error('编辑目标已失效，请重新打开项目')
    }
    const payload = { ...form }
    if (wasEditing) await projectApi.update(targetId, payload)
    else await projectApi.create(payload)
    if (editorGate.isCurrent(session)) {
      ElMessage.success(wasEditing ? '项目更新成功' : '项目创建成功')
      dialogVisible.value = false
      await loadData()
    }
  } catch (error) {
    if (editorGate.isCurrent(session)) ElMessage.error(error.message || '保存项目失败')
  } finally {
    saving.value = false
  }
}

function handleSizeChange() {
  pageNum.value = 1
  loadData()
}

function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—'
}

onMounted(loadData)
onUnmounted(() => {
  listGate.invalidate()
  editorGate.invalidate()
})
</script>