<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">EXECUTION CONFIGURATION</div>
        <h1>测试环境</h1>
        <p>维护本地、test3、预发和生产环境。测试轮次创建时会固定保存环境信息快照。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增环境</el-button>
    </div>

    <el-alert type="warning" :closable="false" show-icon
      title="安全要求：这里只保存凭据引用，不保存密码、Token、Cookie 或 Authorization。环境地址和非敏感参数会进入测试轮次快照。" />

    <el-alert v-if="listError" type="error" :closable="false" show-icon
      style="margin: 16px 0" :title="'环境列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载环境</el-button>
    </el-alert>
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>环境列表</strong><span class="muted-count">共 {{ rows.length }} 个</span></div>
        <el-checkbox v-model="showInactive" @change="loadData">显示已停用环境</el-checkbox>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="环境" min-width="190">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.environmentName }}</div>
            <div class="secondary-cell">{{ row.environmentCode }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }"><el-tag size="small" :type="typeTag(row.environmentType)">{{ typeLabel(row.environmentType) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="环境地址" min-width="220">
          <template #default="{ row }">{{ row.baseUrl || '尚未配置' }}</template>
        </el-table-column>
        <el-table-column label="API 地址" min-width="220">
          <template #default="{ row }">{{ row.apiBaseUrl || '同环境地址 / 尚未配置' }}</template>
        </el-table-column>
        <el-table-column label="认证" width="130">
          <template #default="{ row }">{{ authLabel(row.authType) }}</template>
        </el-table-column>
        <el-table-column label="凭据引用" min-width="150">
          <template #default="{ row }">{{ row.credentialRef || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openEdit(row)">配置</el-button></template>
        </el-table-column>
        <template #empty><el-empty description="暂无环境配置" /></template>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '配置测试环境' : '新增测试环境'" width="760px" top="6vh" destroy-on-close
      @close="invalidateEditor" :close-on-click-modal="!saving"
      :close-on-press-escape="!saving" :show-close="!saving">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon :disabled="saving">
        <div class="form-two-columns">
          <el-form-item label="环境编码" prop="environmentCode">
            <el-input v-model.trim="form.environmentCode" maxlength="32" :disabled="editing"
              placeholder="例如 LOCAL / TEST3 / PRE / PROD" />
          </el-form-item>
          <el-form-item label="环境名称" prop="environmentName">
            <el-input v-model.trim="form.environmentName" maxlength="64" />
          </el-form-item>
          <el-form-item label="环境类型" prop="environmentType">
            <el-select v-model="form.environmentType" style="width:100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="认证方式" prop="authType">
            <el-select v-model="form.authType" style="width:100%">
              <el-option v-for="item in authOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="环境地址">
            <el-input v-model.trim="form.baseUrl" maxlength="512" placeholder="https://example.test" />
          </el-form-item>
          <el-form-item label="API 地址">
            <el-input v-model.trim="form.apiBaseUrl" maxlength="512" placeholder="留空表示与环境地址一致" />
          </el-form-item>
          <el-form-item label="凭据引用" :required="form.authType !== 'NONE'">
            <el-input v-model.trim="form.credentialRef" maxlength="255"
              :disabled="form.authType === 'NONE'" placeholder="例如 local/test3 的凭据配置键名" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
          </el-form-item>
        </div>
        <el-form-item label="非敏感配置 JSON">
          <el-input v-model="form.configJson" type="textarea" :rows="4"
            placeholder='例如：{"timeoutMs":15000,"retryCount":1}' />
          <div class="form-tip">禁止填写密码、Token、Cookie、密钥等内容；服务端会拦截敏感字段名。</div>
        </el-form-item>
        <el-form-item label="环境说明">
          <el-input v-model.trim="form.description" maxlength="1000" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="saving" @click="saveEnvironment">保存配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { createLatestRequest } from '../utils/latestRequest'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElCheckbox, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTag, ElMessage, ElLoadingDirective as vLoading } from 'element-plus'
import { environmentApi } from '../api/environments'

const typeOptions = [
  { value: 'LOCAL', label: '本地' }, { value: 'TEST', label: '测试' },
  { value: 'STAGING', label: '预发' }, { value: 'PROD', label: '生产' },
  { value: 'OTHER', label: '其他' }
]
const authOptions = [
  { value: 'NONE', label: '无需认证' }, { value: 'BEARER', label: 'Bearer Token' },
  { value: 'BASIC', label: 'Basic Auth' }, { value: 'COOKIE', label: 'Cookie' },
  { value: 'API_KEY', label: 'API Key' }, { value: 'CUSTOM', label: '自定义' }
]
const rows = ref([])
const listGate = createLatestRequest()
const listError = ref('')
const loading = ref(false)
const saving = ref(false)
const showInactive = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const editingId = ref(null)
const editorGate = createLatestRequest()
const editorToken = ref(null)
const formRef = ref()
const form = reactive(emptyForm())

function emptyForm() {
  return {
    environmentCode: '', environmentName: '', environmentType: 'TEST',
    baseUrl: '', apiBaseUrl: '', authType: 'NONE', credentialRef: '',
    configJson: '', description: '', active: true, sortOrder: 50
  }
}
const rules = {
  environmentCode: [
    { required: true, message: '请输入环境编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]{1,31}$/, message: '使用大写字母、数字和下划线', trigger: 'blur' }
  ],
  environmentName: [{ required: true, message: '请输入环境名称', trigger: 'blur' }],
  environmentType: [{ required: true, message: '请选择环境类型', trigger: 'change' }],
  authType: [{ required: true, message: '请选择认证方式', trigger: 'change' }]
}

async function loadData() {
  const token = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await environmentApi.list({ activeOnly: !showInactive.value })
    if (!listGate.isCurrent(token)) return
    if (!Array.isArray(result)) throw new Error('环境列表响应格式异常')
    rows.value = result
  } catch (error) {
    if (!listGate.isCurrent(token)) return
    rows.value = []
    listError.value = error.message || '网络异常，请重试'
  } finally {
    if (listGate.isCurrent(token)) loading.value = false
  }
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
    environmentCode: row.environmentCode,
    environmentName: row.environmentName,
    environmentType: row.environmentType,
    baseUrl: row.baseUrl || '', apiBaseUrl: row.apiBaseUrl || '',
    authType: row.authType || 'NONE', credentialRef: row.credentialRef || '',
    configJson: row.configJson || '', description: row.description || '',
    active: row.active, sortOrder: row.sortOrder || 0
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}
async function saveEnvironment() {
  if (saving.value || !formRef.value || !dialogVisible.value) return
  const session = editorToken.value
  if (!session || !editorGate.isCurrent(session)) return
  const wasEditing = editing.value
  const targetId = editingId.value
  saving.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid || !dialogVisible.value || !editorGate.isCurrent(session)) return
    if (wasEditing && (!Number.isSafeInteger(targetId) || targetId <= 0)) {
      throw new Error('编辑环境已失效，请重新打开')
    }
    if (form.configJson?.trim()) {
      try {
        const parsed = JSON.parse(form.configJson)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('配置必须是 JSON 对象')
        }
      } catch (error) {
        ElMessage.warning(error.message || '配置 JSON 格式不正确')
        return
      }
    }
    const payload = { ...form }
    // NONE auth must never persist a credential reference from a prior edit.
    if (payload.authType === 'NONE') payload.credentialRef = ''
    if (wasEditing) await environmentApi.update(targetId, payload)
    else await environmentApi.create(payload)
    if (editorGate.isCurrent(session)) {
      ElMessage.success(wasEditing ? '环境配置已更新' : '环境创建成功')
      dialogVisible.value = false
      await loadData()
    }
  } catch (error) {
    if (editorGate.isCurrent(session)) ElMessage.error(error.message || '保存环境配置失败')
  } finally {
    saving.value = false
  }
}
function typeLabel(value) { return typeOptions.find(item => item.value === value)?.label || value || '—' }
function typeTag(value) {
  return ({ LOCAL: 'success', TEST: '', STAGING: 'warning', PROD: 'danger', OTHER: 'info' })[value] || 'info'
}
function authLabel(value) { return authOptions.find(item => item.value === value)?.label || value || '—' }

onMounted(loadData)
onUnmounted(() => {
  listGate.invalidate()
  editorGate.invalidate()
})
</script>

<style scoped>
.form-tip { margin-top: 6px; color: #8b96a7; font-size: 11px; line-height: 1.6; }
</style>
