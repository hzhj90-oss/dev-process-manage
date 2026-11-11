<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">AUTOMATION LIBRARY</div>
        <h1>自动化脚本库</h1>
        <p>维护固定自动化脚本、运行时配置及不可覆盖的脚本修订历史。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建脚本</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="执行边界：HTTP 为只读 DSL；NODE 在 QuickJS WASM 中执行受限 JavaScript；BROWSER 使用同源限制的受控 Playwright JSON 步骤。Python/Java 执行器尚未接入，Browser Runner 仅用于可信非生产环境。"  />

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filters.keyword" class="filter-keyword" clearable
          placeholder="搜索脚本编号、名称" @keyup.enter="search" />
        <el-select v-model="filters.language" class="filter-status" clearable placeholder="脚本语言">
          <el-option v-for="item in languageOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.enabled" class="filter-status" clearable placeholder="启用状态">
          <el-option label="启用" :value="true" />
          <el-option label="停用" :value="false" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div><strong>脚本列表</strong><span class="muted-count">共 {{ total }} 条</span></div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="脚本编号 / 名称" min-width="220">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.scriptCode }}</div>
            <div class="secondary-cell">{{ row.scriptName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="语言 / 运行时" min-width="140">
          <template #default="{ row }">
            <el-tag size="small">{{ languageLabel(row.scriptLanguage) }}</el-tag>
            <div class="secondary-cell">{{ row.runtimeVersion || '未指定运行时版本' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="脚本版本" width="130">
          <template #default="{ row }"> {{ row.scriptVersion || '—' }} <span class="secondary-cell">修订 V{{ row.revisionNo }}</span></template>
        </el-table-column>
        <el-table-column label="说明" min-width="180" show-overflow-tooltip prop="description">
          <template #default="{ row }">{{ row.description || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" :loading="switchingId === row.id"
              inline-prompt active-text="启用" inactive-text="停用"
              @change="toggleEnabled(row, $event)" />
          </template>
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
        <template #empty><el-empty description="脚本库为空，请新建第一条脚本配置" /></template>
      </el-table>
      <div class="pagination-row">
        <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="editDialog" :title="editing ? '编辑脚本配置' : '新建脚本配置'"
      width="860px" top="5vh" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon>
        <div class="form-two-columns">
          <el-form-item label="脚本编号" prop="scriptCode">
            <el-input v-model.trim="form.scriptCode" maxlength="64" placeholder="例如 API-LOGIN-CHECK" />
          </el-form-item>
          <el-form-item label="脚本名称" prop="scriptName">
            <el-input v-model.trim="form.scriptName" maxlength="255" />
          </el-form-item>
          <el-form-item label="脚本语言" prop="scriptLanguage">
            <el-select v-model="form.scriptLanguage" style="width:100%" @change="handleLanguageChange">
              <el-option v-for="item in languageOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="运行时版本">
            <el-input v-model.trim="form.runtimeVersion" maxlength="64" placeholder="例如 QuickJS WASM 0.32.0 / Python 3.12" />
          </el-form-item>
          <el-form-item label="脚本版本" prop="scriptVersion">
            <el-input v-model.trim="form.scriptVersion" maxlength="64" placeholder="例如 1.0.0" />
          </el-form-item>
          <el-form-item label="入口" prop="entryPoint">
            <el-input v-model.trim="form.entryPoint" maxlength="255"
              :placeholder="form.scriptLanguage === 'NODE' ? '例如 main' : form.scriptLanguage === 'BROWSER' ? '例如 steps' : '例如 request / tests/login.spec.js'" />
          </el-form-item>
          <el-form-item label="脚本来源" prop="sourceType">
            <el-radio-group v-model="form.sourceType">
              <el-radio-button label="INLINE">内联内容</el-radio-button>
              <el-radio-button label="FILE" :disabled="['HTTP', 'NODE', 'BROWSER'].includes(form.scriptLanguage)">受控文件引用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="启用状态">
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>
        <el-form-item v-if="form.sourceType === 'INLINE'" label="脚本内容" prop="sourceContent">
          <el-input v-model="form.sourceContent" type="textarea" :rows="10"
            maxlength="100000" show-word-limit placeholder="NODE：function main(ctx)；HTTP：只读 JSON DSL；BROWSER：填写包含 GOTO、ASSERT_VISIBLE 等步骤的 JSON DSL。" />
        </el-form-item>
        <el-form-item v-else label="相对路径" prop="sourcePath">
          <el-input v-model.trim="form.sourcePath" maxlength="512"
            placeholder="例如 node/api/login-check.js（相对于受控脚本目录）" />
          <div class="script-tip">仅允许相对路径，不允许盘符、绝对路径或 .. 目录穿越。Python/Java 文件目前仅登记，不会被执行；HTTP/NODE Runner 仅支持内联内容。</div>
        </el-form-item>
        <el-form-item label="参数 JSON">
          <el-input v-model="form.argumentsJson" type="textarea" :rows="3"
            placeholder='可选，例如：{"timeout":10000,"retries":1}' />
        </el-form-item>
        <el-form-item label="脚本说明">
          <el-input v-model.trim="form.description" maxlength="1000" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item v-if="editing" label="修订说明" prop="changeNote">
          <el-input v-model.trim="form.changeNote" maxlength="1000" type="textarea" :rows="2"
            placeholder="说明本次脚本配置/源码修改；保存后生成新的不可变修订" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveScript">
          {{ editing ? '保存并生成新修订' : '创建脚本' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialog" title="脚本修订历史" width="920px" top="5vh" destroy-on-close>
      <div v-if="historyScript" class="history-case-heading">
        <strong>{{ historyScript.scriptCode }} · {{ historyScript.scriptName }}</strong>
        <span>当前修订：V{{ historyScript.revisionNo }}</span>
      </div>
      <div class="history-layout">
        <div class="history-list">
          <div v-if="!revisions.length" class="script-tip">暂无修订记录</div>
          <button v-for="item in revisions" :key="item.id"
            class="history-item" :class="{ selected: selectedRevision && selectedRevision.id === item.id }"
            @click="selectRevision(item)">
            <strong>V{{ item.revisionNo }} · {{ item.scriptVersion }}</strong>
            <span>{{ formatDate(item.createdAt) }}</span>
            <small>{{ item.changeNote || '未填写修订说明' }}</small>
          </button>
        </div>
        <div class="history-detail">
          <el-skeleton v-if="historyLoading" :rows="7" animated />
          <template v-else-if="selectedRevision">
            <div class="history-detail-head">
              <div><el-tag size="small">{{ languageLabel(selectedRevision.scriptLanguage) }}</el-tag>
                <strong>{{ selectedRevision.scriptVersion }} · {{ selectedRevision.runtimeVersion || '未指定运行时' }}</strong></div>
              <span>{{ formatDate(selectedRevision.createdAt) }}</span>
            </div>
            <p class="history-text">入口：{{ selectedRevision.entryPoint }}</p>
            <p class="history-text">来源：{{ selectedRevision.sourceType === 'INLINE' ? '内联内容' : selectedRevision.sourcePath }}</p>
            <h4>参数 JSON</h4>
            <pre class="script-code">{{ selectedRevision.argumentsJson || '无' }}</pre>
            <h4>脚本内容快照</h4>
            <pre class="script-code">{{ selectedRevision.sourceContent || '使用受控文件引用，当前不读取文件内容。' }}</pre>
            <p v-if="selectedRevision.changeNote" class="history-note">{{ selectedRevision.changeNote }}</p>
          </template>
          <el-empty v-else description="请选择一个修订版本" />
        </div>
      </div>
      <template #footer><el-button @click="historyDialog = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElRadioButton, ElRadioGroup, ElSelect, ElSkeleton, ElSwitch, ElTable, ElTableColumn, ElTag, ElMessage, ElMessageBox, ElLoadingDirective as vLoading } from 'element-plus'
import { testScriptApi } from '../api/testScripts'

const languageOptions = [
  { value: 'NODE', label: 'JavaScript (QuickJS)' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'JAVA', label: 'Java / JUnit' },
  { value: 'HTTP', label: 'HTTP / API' },
  { value: 'BROWSER', label: 'Browser / Playwright' }
]
const loading = ref(false)
const saving = ref(false)
const switchingId = ref(null)
const rows = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', language: '', enabled: null })
const editDialog = ref(false)
const editing = ref(false)
const editingId = ref(null)
const formRef = ref()
const historyDialog = ref(false)
const historyScript = ref(null)
const revisions = ref([])
const selectedRevision = ref(null)
const historyLoading = ref(false)
const form = reactive(emptyForm())

function emptyForm() {
  return {
    scriptCode: '', scriptName: '', scriptLanguage: 'NODE',
    runtimeVersion: 'QuickJS WASM 0.32.0', scriptVersion: '1.0.0',
    sourceType: 'INLINE', sourcePath: '', sourceContent: '',
    entryPoint: 'main', argumentsJson: '', description: '',
    enabled: true, changeNote: '', createdBy: 'local-user'
  }
}
const rules = {
  scriptCode: [{ required: true, message: '请输入脚本编号', trigger: 'blur' }],
  scriptName: [{ required: true, message: '请输入脚本名称', trigger: 'blur' }],
  scriptLanguage: [{ required: true, message: '请选择脚本语言', trigger: 'change' }],
  scriptVersion: [{ required: true, message: '请输入脚本版本', trigger: 'blur' }],
  sourceType: [{ required: true, message: '请选择脚本来源', trigger: 'change' }],
  entryPoint: [{ required: true, message: '请输入入口', trigger: 'blur' }],
  sourceContent: [{
    validator: (rule, value, callback) => {
      if (form.sourceType === 'INLINE' && !value?.trim()) callback(new Error('请输入脚本内容'))
      else callback()
    }, trigger: 'blur'
  }],
  sourcePath: [{
    validator: (rule, value, callback) => {
      if (form.sourceType === 'FILE' && !value?.trim()) callback(new Error('请输入受控相对路径'))
      else callback()
    }, trigger: 'blur'
  }],
  changeNote: [{ required: true, message: '请填写本次修订说明', trigger: 'blur' }]
}

async function loadData() {
  loading.value = true
  try {
    const result = await testScriptApi.page({
      keyword: filters.keyword || undefined,
      language: filters.language || undefined,
      enabled: filters.enabled === null ? undefined : filters.enabled,
      pageNum: pageNum.value, pageSize: pageSize.value
    })
    rows.value = result.list || []
    total.value = result.total || 0
  } catch (error) { ElMessage.error(error.message) }
  finally { loading.value = false }
}
function search() { pageNum.value = 1; loadData() }
function resetFilters() {
  Object.assign(filters, { keyword: '', language: '', enabled: null })
  search()
}
function handleSizeChange() { pageNum.value = 1; loadData() }

function handleLanguageChange(language) {
  if (['HTTP', 'NODE', 'BROWSER'].includes(language) && form.sourceType === 'FILE') {
    form.sourceType = 'INLINE'
    form.sourcePath = ''
  }
  if (language === 'NODE' && (!form.runtimeVersion || form.runtimeVersion === 'Node.js 24')) {
    form.runtimeVersion = 'QuickJS WASM 0.32.0'
  }
}

function openCreate() {
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm())
  editDialog.value = true
  formRef.value?.clearValidate()
}
async function openEdit(row) {
  editing.value = true
  editingId.value = row.id
  editDialog.value = true
  Object.assign(form, emptyForm())
  try {
    const detail = await testScriptApi.get(row.id)
    Object.assign(form, {
      scriptCode: detail.scriptCode, scriptName: detail.scriptName,
      scriptLanguage: detail.scriptLanguage, runtimeVersion: detail.runtimeVersion || '',
      scriptVersion: detail.scriptVersion || '1.0.0', sourceType: detail.sourceType || 'INLINE',
      sourcePath: detail.sourcePath || '', sourceContent: detail.sourceContent || '',
      entryPoint: detail.entryPoint || 'main', argumentsJson: detail.argumentsJson || '',
      description: detail.description || '', enabled: detail.enabled,
      changeNote: '', createdBy: 'local-user'
    })
    formRef.value?.clearValidate()
  } catch (error) {
    ElMessage.error(error.message)
    editDialog.value = false
  }
}
async function saveScript() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (form.argumentsJson?.trim()) {
    try {
      const parsed = JSON.parse(form.argumentsJson)
      if (parsed === null || typeof parsed !== 'object') throw new Error('参数必须为 JSON 对象或数组')
    } catch (error) {
      ElMessage.warning(error.message || '参数 JSON 格式不正确')
      return
    }
  }
  saving.value = true
  try {
    const payload = { ...form }
    if (payload.sourceType === 'INLINE') payload.sourcePath = ''
    else payload.sourceContent = ''
    if (editing.value) {
      await testScriptApi.update(editingId.value, payload)
      ElMessage.success('脚本已更新，并生成新的修订版本')
    } else {
      await testScriptApi.create(payload)
      ElMessage.success('脚本配置创建成功')
    }
    editDialog.value = false
    await loadData()
  } catch (error) { ElMessage.error(error.message) }
  finally { saving.value = false }
}

async function toggleEnabled(row, enabled) {
  switchingId.value = row.id
  try {
    await testScriptApi.setEnabled(row.id, enabled)
    ElMessage.success(enabled ? '脚本已启用' : '脚本已停用')
    await loadData()
  } catch (error) {
    ElMessage.error(error.message)
    await loadData()
  } finally { switchingId.value = null }
}

async function openHistory(row) {
  historyScript.value = row
  revisions.value = []
  selectedRevision.value = null
  historyDialog.value = true
  historyLoading.value = true
  try {
    revisions.value = await testScriptApi.revisions(row.id)
    if (revisions.value.length) await selectRevision(revisions.value[0])
  } catch (error) { ElMessage.error(error.message) }
  finally { historyLoading.value = false }
}
async function selectRevision(item) {
  selectedRevision.value = null
  historyLoading.value = true
  try { selectedRevision.value = await testScriptApi.getRevision(historyScript.value.id, item.id) }
  catch (error) { ElMessage.error(error.message) }
  finally { historyLoading.value = false }
}
function languageLabel(value) {
  return languageOptions.find(item => item.value === value)?.label || value || '—'
}
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '—' }

onMounted(loadData)
</script>

<style scoped>
.script-tip { margin-top: 6px; color: #8b96a7; font-size: 11px; line-height: 1.6; }
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
.history-detail h4 { margin: 18px 0 7px; color: #34425b; font-size: 12px; }
.history-detail-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.history-detail-head strong { margin-left: 9px; color: #647188; font-size: 11px; }
.history-detail-head span { color: #8c97a8; font-size: 10px; }
.history-text { white-space: pre-wrap; overflow-wrap: anywhere; color: #647188; font-size: 12px; line-height: 1.7; }
.history-note { padding: 9px 11px; background: #fff9ed; border-radius: 7px; color: #647188; font-size: 12px; }
.script-code { max-height: 260px; overflow: auto; padding: 12px; background: #f6f7fa; border: 1px solid #edf0f5; border-radius: 8px; color: #42506a; font: 11px/1.65 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 760px) {
  .history-layout { grid-template-columns: 1fr; }
  .history-list { border-right: 0; border-bottom: 1px solid #edf0f5; padding: 0 0 12px; }
}
</style>
