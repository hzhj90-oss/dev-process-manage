<template>
  <div class="dashboard-page">
    <div class="welcome">
      <div>
        <div class="eyebrow">SOFTWARE DELIVERY WORKSPACE</div>
        <h1>让每个版本的开发过程都可追溯</h1>
        <p>从项目和版本开始，逐步串联需求、详细设计、测试用例与执行结果。</p>
      </div>
      <div class="welcome-mark">DP</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span>项目总数</span>
        <strong>{{ loading ? '—' : formatCount(stats.projects) }}</strong>
        <small>已登记的软件项目</small>
      </div>
      <div class="stat-card">
        <span>版本总数</span>
        <strong>{{ loading ? '—' : formatCount(stats.versions) }}</strong>
        <small>覆盖所有项目的版本</small>
      </div>
      <div class="stat-card">
        <span>测试环境</span>
        <strong>{{ loading ? '—' : formatCount(stats.environments) }}</strong>
        <small>已登记的所有测试环境</small>
      </div>
      <div class="stat-card">
        <span>测试用例</span>
        <strong>{{ loading ? '—' : formatCount(stats.testCases) }}</strong>
        <small>已登记的全部用例</small>
      </div>
      <div class="stat-card">
        <span>测试轮次</span>
        <strong>{{ loading ? '—' : formatCount(stats.testCycles) }}</strong>
        <small>包含运行中与历史轮次</small>
      </div>
      <div class="stat-card">
        <span>执行任务</span>
        <strong>{{ loading ? '—' : formatCount(stats.executionTasks) }}</strong>
        <small>累计任务总量</small>
      </div>
    </div>
    <p v-if="loadError" role="alert" class="dashboard-load-error">{{ loadError }}</p>

    <div class="section-heading">
      <div>
        <h2>过程管理</h2>
        <p>按开发生命周期组织工作</p>
      </div>
    </div>
    <div class="module-grid">
      <article class="module-card">
        <div class="module-icon blue">01</div>
        <h3>项目管理</h3>
        <p>登记代码项目、仓库地址、主分支和项目状态。</p>
        <router-link to="/projects">管理项目 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon violet">02</div>
        <h3>版本管理</h3>
        <p>创建版本，维护计划日期、版本状态和交付说明。</p>
        <router-link to="/versions">管理版本 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon teal">03</div>
        <h3>需求与详细设计</h3>
        <p>将需求归属到版本，记录设计方案和修订历史。</p>
        <router-link to="/requirements">管理需求与设计 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon orange">04</div>
        <h3>测试用例</h3>
        <p>管理测试步骤、预期结果和自动执行方式。</p>
        <router-link to="/test-cases">管理测试用例 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon teal">05</div>
        <h3>自动化脚本</h3>
        <p>统一管理 HTTP、Node 和 Browser Runner 脚本。</p>
        <router-link to="/test-scripts">管理脚本 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon blue">06</div>
        <h3>测试轮次</h3>
        <p>选择用例与环境，冻结快照并启动测试。</p>
        <router-link to="/test-cycles">管理测试轮次 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon violet">07</div>
        <h3>执行任务</h3>
        <p>查看 Runner 执行状态、结果、错误及截图证据。</p>
        <router-link to="/execution-tasks">查看执行任务 →</router-link>
      </article>
      <article class="module-card">
        <div class="module-icon orange">08</div>
        <h3>测试报告</h3>
        <p>按轮次查看通过率、失败原因与执行证据。</p>
        <router-link to="/test-reports">查看测试报告 →</router-link>
      </article>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { projectApi } from '../api/projects'
import { versionApi } from '../api/versions'
import { environmentApi } from '../api/environments'
import { testCaseApi } from '../api/testCases'
import { testCycleApi } from '../api/testCycles'
import { executionTaskApi } from '../api/executionTasks'

const loading = ref(true)
const loadError = ref('')
const stats = ref({
  projects: null, versions: null, environments: null,
  testCases: null, testCycles: null, executionTasks: null
})
const formatCount = value => Number.isSafeInteger(value) && value >= 0 ? value : '—'

async function loadStats() {
  loading.value = true
  loadError.value = ''
  const results = await Promise.allSettled([
    projectApi.page({ pageNum: 1, pageSize: 1 }),
    versionApi.page({ pageNum: 1, pageSize: 1 }),
    environmentApi.list({ activeOnly: false }),
    testCaseApi.page({ pageNum: 1, pageSize: 1 }),
    testCycleApi.page({ pageNum: 1, pageSize: 1 }),
    executionTaskApi.page({ pageNum: 1, pageSize: 1 })
  ])
  const keys = ['projects', 'versions', 'environments', 'testCases', 'testCycles', 'executionTasks']
  const next = {}
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const value = result.status === 'fulfilled'
      ? (keys[i] === 'environments' ? result.value?.length : result.value?.total)
      : null
    next[keys[i]] = Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  stats.value = next
  if (Object.values(next).some(value => value === null)) {
    loadError.value = '部分统计暂时无法获取，请稍后刷新页面；未加载的数据不会显示为 0。'
  }
  loading.value = false
}

onMounted(loadStats)
</script>