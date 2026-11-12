import { createRouter, createWebHashHistory } from 'vue-router'
// 页面按路由懒加载：首次进入某个模块时才加载该模块的组件代码。
const DashboardView = () => import('../views/DashboardView.vue')
const ProjectListView = () => import('../views/ProjectListView.vue')
const VersionListView = () => import('../views/VersionListView.vue')
const RequirementListView = () => import('../views/RequirementListView.vue')
const TestCaseListView = () => import('../views/TestCaseListView.vue')
const TestScriptListView = () => import('../views/TestScriptListView.vue')
const EnvironmentListView = () => import('../views/EnvironmentListView.vue')
const TestCycleListView = () => import('../views/TestCycleListView.vue')
const ExecutionTaskListView = () => import('../views/ExecutionTaskListView.vue')
const TestReportListView = () => import('../views/TestReportListView.vue')
const AiExecutionWorkbenchView = () => import('../views/AiExecutionWorkbenchView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/projects', name: 'projects', component: ProjectListView },
    { path: '/versions', name: 'versions', component: VersionListView },
    { path: '/requirements', name: 'requirements', component: RequirementListView },
    { path: '/test-cases', name: 'test-cases', component: TestCaseListView },
    { path: '/test-scripts', name: 'test-scripts', component: TestScriptListView },
    { path: '/environments', name: 'environments', component: EnvironmentListView },
    { path: '/test-cycles', name: 'test-cycles', component: TestCycleListView },
    { path: '/execution-tasks', name: 'execution-tasks', component: ExecutionTaskListView },
    { path: '/ai-execution', name: 'ai-execution', component: AiExecutionWorkbenchView },
    { path: '/test-reports', name: 'test-reports', component: TestReportListView }
  ]
})

export default router