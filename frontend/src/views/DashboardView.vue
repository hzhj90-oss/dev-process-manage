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
        <strong>{{ loading ? '—' : stats.projects }}</strong>
        <small>已登记的软件项目</small>
      </div>
      <div class="stat-card">
        <span>版本总数</span>
        <strong>{{ loading ? '—' : stats.versions }}</strong>
        <small>覆盖所有项目的版本</small>
      </div>
      <div class="stat-card">
        <span>测试环境</span>
        <strong>4</strong>
        <small>LOCAL / TEST3 / PRE / PROD</small>
      </div>
    </div>

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
      <article class="module-card pending">
        <div class="module-icon orange">04</div>
        <h3>测试用例与执行</h3>
        <p>关联脚本或由 ChatGPT 动态生成执行逻辑。</p>
        <span>后续阶段</span>
      </article>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { projectApi } from '../api/projects'
import { versionApi } from '../api/versions'

const loading = ref(true)
const stats = ref({ projects: 0, versions: 0 })

onMounted(async () => {
  try {
    const [projects, versions] = await Promise.all([
      projectApi.page({ pageNum: 1, pageSize: 1 }),
      versionApi.page({ pageNum: 1, pageSize: 1 })
    ])
    stats.value = { projects: projects.total, versions: versions.total }
  } catch (error) {
    console.error('加载概览统计失败', error)
  } finally {
    loading.value = false
  }
})
</script>