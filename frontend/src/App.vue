<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">DP</div>
        <div><strong>Dev Process</strong><small>开发过程管理</small></div>
      </div>
      <div class="nav-caption">工作空间</div>
      <nav class="nav-list">
        <router-link class="nav-item" to="/" exact-active-class="active">概览</router-link>
        <router-link class="nav-item" to="/projects" active-class="active">项目管理</router-link>
        <router-link class="nav-item" to="/versions" active-class="active">版本管理</router-link>
        <router-link class="nav-item" to="/requirements" active-class="active">需求与详细设计</router-link>
        <router-link class="nav-item" to="/test-cases" active-class="active">测试用例</router-link>
        <router-link class="nav-item" to="/test-scripts" active-class="active">自动化脚本库</router-link>
        <router-link class="nav-item" to="/environments" active-class="active">测试环境</router-link>
        <router-link class="nav-item" to="/test-cycles" active-class="active">测试轮次</router-link>
        <router-link class="nav-item" to="/execution-tasks" active-class="active">执行任务</router-link>
        <router-link class="nav-item" to="/test-reports" active-class="active">测试报告</router-link>
      </nav>
      <div class="sidebar-footer">Local workspace · T14s</div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div>
          <strong>开发过程管理平台</strong>
          <span class="topbar-subtitle">Software Delivery Workspace</span>
        </div>
        <span class="environment"><i></i> 本机工作区</span>
      </header>
      <section class="content"><router-view /></section>
    </main>
  </div>
</template>