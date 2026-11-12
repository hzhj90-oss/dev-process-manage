<template>
  <div class="page-view">
    <div class="page-heading">
      <div>
        <div class="eyebrow">TEST CAMPAIGNS</div>
        <h1>测试轮次</h1>
        <p>同一版本可以建立多个测试轮次；每轮只绑定一个环境，并固定代码版本、用例修订和需求覆盖快照。</p>
      </div>
      <div class="diagnostics-actions">
        <el-button type="warning" plain @click="openDiagnostics">轮次状态诊断</el-button>
        <el-button type="primary" :loading="optionsLoading" :disabled="!!optionsError" @click="openCreate">新建测试轮次</el-button>
      </div>
    </div>

    <el-alert type="info" :closable="false" show-icon
      title="创建轮次时会锁定当前用例修订、关联需求及最新详细设计。后续修改原用例或需求，不会改变本轮测试依据。" />
    <el-alert v-if="optionsError" type="error" :closable="false" show-icon style="margin: 12px 0"
      :title="'版本、环境或用例选项加载失败：' + optionsError">
      <el-button link type="primary" :loading="optionsLoading" @click="loadOptions">重新加载选项</el-button>
    </el-alert>

    <el-alert v-if="placementCaseId" type="info" :closable="false" show-icon
      style="margin: 12px 0" :title="'当前来源：测试用例 #' + placementCaseId + '。选择尚未开始的同版本轮次，或为此用例创建新轮次。'">
      <el-button link type="primary" :disabled="!!cycleMutation" @click="openCasePlacement">选择目标轮次</el-button>
      <el-button link :disabled="!!cycleMutation" @click="clearCasePlacementContext">退出用例加入模式</el-button>
    </el-alert>

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

    <el-alert v-if="listError" type="error" show-icon :closable="false" style="margin-bottom: 16px"
      :title="'测试轮次列表加载失败：' + listError">
      <el-button link type="primary" @click="loadData">重试加载</el-button>
    </el-alert>
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
            <el-button v-if="row.status === 'PLANNED'" link type="primary"
              :disabled="!!cycleMutation" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 'PLANNED'" link type="success"
              :loading="cycleMutation === 'start:' + row.id"
              :disabled="!!cycleMutation" @click="startCycle(row)">开始</el-button>
            <el-button v-if="row.status === 'RUNNING' || row.status === 'PLANNED'" link type="danger"
              :loading="cycleMutation === 'abort:' + row.id"
              :disabled="!!cycleMutation" @click="abortCycle(row)">终止</el-button>
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

    <el-dialog v-model="diagnosticsDialog" title="测试轮次状态诊断（只读）"
      width="1020px" top="5vh" destroy-on-close @closed="invalidateDiagnostics">
      <div v-loading="diagnosticsLoading" class="diagnostics-content">
        <el-alert type="info" :closable="false" show-icon
          title="仅列出「轮次进行中，但全部用例已结束」的异常候选。诊断不会修复、结束或重新执行任何测试轮次。" />
        <el-alert v-if="diagnosticsError" type="error" :closable="false"
          show-icon :title="diagnosticsError" class="diagnostics-spaced" />
        <template v-if="diagnosticsData">
          <div class="diagnostics-summary">
            <strong>发现 {{ diagnosticsData.count }} 个异常候选</strong>
            <span>仍有活动根任务：{{ diagnosticsData.activeRootCycles }}</span>
            <span>无活动根任务：{{ diagnosticsData.noActiveRootCycles }}</span>
            <span>无根任务记录：{{ diagnosticsData.noRootTaskCycles }}</span>
          </div>
          <el-alert v-if="diagnosticsData.truncated" type="warning" :closable="false"
            show-icon title="候选数量已达到当前查询上限；请使用命令行只读巡检检查全部轮次。" />
          <el-table :data="diagnosticsData.items" row-key="cycleId" stripe max-height="470">
            <el-table-column label="轮次" min-width="260">
              <template #default="{ row }">
                <div class="primary-cell">#{{ row.cycleId }} · {{ row.cycleName }}</div>
                <div class="secondary-cell">{{ row.projectName }} / {{ row.versionNo }}</div>
              </template>
            </el-table-column>
            <el-table-column label="用例终态" width="170">
              <template #default="{ row }">
                {{ row.completedCases }} 完成 · {{ row.cancelledCases }} 取消 / 共 {{ row.caseCount }}
              </template>
            </el-table-column>
            <el-table-column label="根任务" width="170">
              <template #default="{ row }">
                <div>全部 {{ row.rootTaskCount }} · 活动 {{ row.activeRootTasks }}</div>
                <div class="secondary-cell">完成 {{ row.completedRootTasks }} · 失败 {{ row.failedRootTasks }} · 取消 {{ row.cancelledRootTasks }}</div>
              </template>
            </el-table-column>
            <el-table-column label="诊断分类" width="135">
              <template #default="{ row }">
                <el-tag size="small" :type="row.diagnosticCategory === 'ACTIVE_ROOT_TASK' ? 'danger' : 'warning'">
                  {{ diagnosticCategoryLabel(row.diagnosticCategory) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDiagnosticCycle(row)">查看轮次</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="目前没有检测到这类状态不一致" /></template>
          </el-table>
        </template>
      </div>
      <template #footer>
        <el-button @click="openDiagnostics" :loading="diagnosticsLoading">重新诊断</el-button>
        <el-button @click="diagnosticsDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialog" :title="editing ? '编辑测试轮次' : '新建测试轮次'"
      width="860px" top="4vh" destroy-on-close @close="invalidateCycleEditor"
      :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <div v-if="editorLoading" v-loading="true" style="min-height: 80px" />
      <el-alert v-if="editorError" type="error" show-icon :closable="false"
        :title="'测试轮次配置读取失败：' + editorError">
        <el-button link type="primary" @click="retryCycleEditor">重试读取轮次配置</el-button>
      </el-alert>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="112px" status-icon
        :disabled="editorLoading || !!editorError || saving">
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
        <el-button :disabled="saving" @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving"
          :disabled="editorLoading || !!editorError || !!optionsError || optionsLoading"
          @click="saveCycle">
          {{ editing ? '保存轮次配置' : '创建轮次并生成快照' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" title="测试轮次详情" width="1120px" top="3vh" destroy-on-close
      @close="invalidateCycleDetail" :close-on-click-modal="!cycleMutation"
      :close-on-press-escape="!cycleMutation" :show-close="!cycleMutation">
      <div v-if="detailLoading" v-loading="true" style="min-height: 130px" />
      <el-alert v-if="detailError" type="error" show-icon :closable="false" :title="detailError" />
      <el-button v-if="detailError" type="primary" plain size="small" style="margin: 12px 0"
        @click="retryCycleDetail">重试读取轮次详情</el-button>
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
        <section v-if="coverageReport" class="cycle-coverage-panel" aria-label="轮次需求覆盖汇总">
          <div class="detail-section-heading"><strong>本轮需求覆盖汇总（冻结快照）</strong></div>
          <el-alert v-if="coverageReport.error" type="warning" :closable="false" show-icon
            :title="'无法核对本轮覆盖统计：' + coverageReport.error" />
          <template v-else-if="coverageReport.value">
            <div class="coverage-stat-grid">
              <div><strong>{{ coverageReport.value.requirementCount }}</strong><span>覆盖需求</span></div>
              <div><strong>{{ coverageReport.value.linkedCases }}</strong><span>关联需求的用例</span></div>
              <div><strong>{{ coverageReport.value.genericCases }}</strong><span>通用无需求用例</span></div>
              <div><strong>{{ coverageReport.value.missingDesignLinks }}</strong><span>缺设计快照的用例-需求关联</span></div>
            </div>
            <el-alert v-if="coverageReport.value.genericCases" type="warning" show-icon
              :closable="false" style="margin:10px 0"
              :title="'本轮有 ' + coverageReport.value.genericCases + ' 条通用用例；它们不构成需求覆盖，不能用用例总数代替覆盖需求数。'" />
            <el-alert v-if="coverageReport.value.missingDesignLinks" type="warning" show-icon
              :closable="false" style="margin:10px 0"
              :title="'有 ' + coverageReport.value.missingDesignLinks + ' 个用例-需求关联没有完整设计修订快照；这不表示当前需求没有设计。'" />
            <el-table :data="coverageReport.value.requirements" row-key="requirementId" stripe
              size="small" max-height="280">
              <el-table-column label="需求编号 / 快照标题" min-width="250">
                <template #default="{ row }">
                  <div class="primary-cell">{{ row.requirementNo }}</div>
                  <div class="secondary-cell">{{ row.title }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="caseCount" label="关联用例" width="100" />
              <el-table-column prop="passCount" label="通过" width="78" />
              <el-table-column prop="issueCount" label="失败/阻塞" width="95" />
              <el-table-column prop="pendingCount" label="未通过/未测" width="115" />
              <el-table-column label="设计快照" width="125">
                <template #default="{ row }">
                  <el-tag :type="row.missingDesignCases ? 'warning' : 'success'" size="small">
                    {{ row.missingDesignCases ? row.missingDesignCases + '例缺失' : '已关联' }}
                  </el-tag>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="本轮没有需求覆盖快照；如均为通用用例，这是预期行为" />
              </template>
            </el-table>
            <p class="coverage-note">
              仅汇总此轮创建或加入用例时冻结的关联需求、设计与结果；不读取实时需求，不代表该版本所有需求均已覆盖。
            </p>
          </template>
        </section>
        <div class="detail-section-heading">
          <strong>本轮测试用例（{{ detail.cases?.length || 0 }}）</strong>
          <div class="detail-actions">
            <el-button size="small" plain type="primary" @click="openReport(detail)">查看报告</el-button>
            <el-button size="small" plain @click="openReport(detail, true)">下载 HTML</el-button>
            <el-button v-if="detail.status === 'PLANNED'" size="small" plain type="primary"
              :disabled="!!cycleMutation || optionsLoading || !!optionsError" @click="openAddCases">增加用例</el-button>
            <el-button v-if="detail.status === 'RUNNING'" size="small" type="success"
              :loading="cycleMutation === 'create-cycle:' + detail.id"
              :disabled="!!cycleMutation || !detail.cases?.length"
              @click="createCycleExecution">创建整轮执行任务</el-button>
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
              <el-button link type="success" :loading="cycleMutation === 'create-case:' + row.id"
                :disabled="!!cycleMutation" @click="createCaseExecution(row)">单独执行</el-button>
            </template>
          </el-table-column>
          <el-table-column v-if="detail.status === 'PLANNED'" label="操作" width="80">
            <template #default="{ row }"><el-button link type="danger"
              :loading="cycleMutation === 'remove:' + row.id"
              :disabled="!!cycleMutation" @click="removeCase(row)">移除</el-button></template>
          </el-table-column>
          <template #empty><el-empty description="当前轮次尚未选择测试用例" /></template>
        </el-table>
      </template>
      <template #footer>
        <el-button v-if="detail?.status === 'PLANNED'" type="success"
          :loading="cycleMutation === 'start:' + detail.id"
          :disabled="!!cycleMutation" @click="startCycle(detail)">开始测试</el-button>
        <el-button v-if="detail?.status === 'PLANNED' || detail?.status === 'RUNNING'"
          type="danger" plain :loading="cycleMutation === 'abort:' + detail.id"
          :disabled="!!cycleMutation" @click="abortCycle(detail)">终止轮次</el-button>
        <el-button :disabled="!!cycleMutation" @click="detailDialog = false">关闭</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="placementDialog" title="将测试用例加入轮次" width="720px" destroy-on-close
      @closed="handleCasePlacementClosed"
      :close-on-click-modal="!placementBusy" :close-on-press-escape="!placementBusy"
      :show-close="!placementBusy">
      <div v-loading="placementLoading" style="min-height: 120px">
        <el-alert v-if="placementError" type="error" :closable="false" show-icon
          :title="placementError" style="margin-bottom: 12px">
          <el-button link type="primary" :disabled="placementBusy" @click="openCasePlacement">重新读取来源与轮次</el-button>
        </el-alert>
        <template v-if="placementSource && !placementError">
          <p><strong>{{ placementSource.caseNo }} · {{ placementSource.title }}</strong></p>
          <el-alert v-if="placementSource.generic" type="warning" :closable="false" show-icon
            title="这是未关联需求的通用用例，可加入任意版本的计划中轮次，但不会自动产生需求覆盖快照。" />
          <el-alert v-else type="info" :closable="false" show-icon
            title="仅显示与用例关联需求相同版本的计划中轮次；跨版本用例不会被误算为需求覆盖。" />
          <el-form label-width="112px" style="margin-top: 16px">
            <el-form-item label="选择计划轮次">
              <el-select v-model="placementSelectedCycleId" style="width:100%" filterable
                :disabled="placementBusy" placeholder="选择尚未开始的轮次">
                <el-option v-for="item in placementCandidates" :key="item.id"
                  :label="item.projectName + ' / ' + item.versionNo + ' · ' + item.cycleName + ' (' + item.environmentName + ')'"
                  :value="item.id" />
              </el-select>
            </el-form-item>
          </el-form>
          <el-empty v-if="!placementCandidates.length" description="当前没有符合版本约束的计划中轮次，可先创建新轮次" />
          <el-divider content-position="left">或者创建一轮测试</el-divider>
          <el-form label-width="112px">
            <el-form-item label="选择所属版本">
              <el-select v-model="placementCreateVersionId" style="width:100%" filterable
                :disabled="placementBusy" placeholder="请选择版本">
                <el-option v-for="item in placementVersions" :key="item.id"
                  :label="item.projectName + ' / ' + item.versionNo" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-form>
          <div class="form-tip">新轮次将自动预选此用例；你仍需填写环境、代码版本等信息，确认保存才会创建快照。</div>
        </template>
      </div>
      <template #footer>
        <el-button :disabled="placementBusy" @click="placementDialog = false">取消</el-button>
        <el-button type="primary" plain :disabled="placementLoading || placementBusy || !!placementError || !placementCreateVersionId"
          @click="createCycleForPlacement">新建轮次并预选用例</el-button>
        <el-button type="success" :loading="placementBusy"
          :disabled="placementLoading || !!placementError || !placementSelectedCycleId || !!cycleMutation"
          @click="submitCasePlacement">加入所选轮次</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="addCasesDialog" title="增加测试用例" width="620px" destroy-on-close
      :close-on-click-modal="!cycleMutation" :close-on-press-escape="!cycleMutation"
      :show-close="!cycleMutation">
      <el-form label-width="90px">
        <el-form-item label="选择用例">
          <el-select v-model="addCaseIds" multiple filterable clearable collapse-tags
            :disabled="!!cycleMutation" collapse-tags-tooltip style="width:100%"
            placeholder="选择需要加入本轮的用例">
            <el-option v-for="item in addableCases" :key="item.id"
              :label="item.caseNo + ' / ' + item.title" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="!!cycleMutation" @click="addCasesDialog = false">取消</el-button>
        <el-button type="primary" :loading="cycleMutation === 'add'"
          :disabled="!!cycleMutation || !addCaseIds.length"
          @click="saveAddedCases">加入本轮并固定当前修订</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
// 页面组件仅在对应路由加载时引入，避免将全部 Element Plus 打入首屏。
import { ElAlert, ElButton, ElCard, ElDialog, ElDivider, ElEmpty, ElForm, ElFormItem, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElMessage, ElMessageBox, ElLoadingDirective as vLoading } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import { contextId } from '../utils/contextNavigation'
import { executionTaskApi } from '../api/executionTasks'
import { versionApi } from '../api/versions'
import { environmentApi } from '../api/environments'
import { testCaseApi } from '../api/testCases'
import { testCycleApi } from '../api/testCycles'
import { createLatestRequest } from '../utils/latestRequest'
import { loadPagedOptions } from '../utils/pagedOptions'
import { buildCycleCoverage } from '../utils/cycleCoverage'
import { readCasePlacement, eligiblePlannedCycles, validateCasePlacement,
  validatePlacementResponse } from '../utils/caseCyclePlacement'

const router = useRouter()
const route = useRoute()
const placementCaseId = computed(() => contextId(route.query.caseId))
const placementDialog = ref(false)
const placementLoading = ref(false)
const placementError = ref('')
const placementSource = ref(null)
const placementCandidates = ref([])
const placementSelectedCycleId = ref(null)
const placementCreateVersionId = ref(null)
const placementBusy = ref(false)
const placementVersions = computed(() => versions.value.filter(item =>
  placementSource.value?.generic || placementSource.value?.versionIds.includes(contextId(item.id))))
let placementSequence = 0
const listGate = createLatestRequest()
const listError = ref('')
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
const optionsError = ref('')
const optionsLoading = ref(false)
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
const cycleEditorGate = createLatestRequest()
const cycleEditorToken = ref(null)
const editorLoading = ref(false)
const editorError = ref('')
const formRef = ref()
const form = reactive(emptyForm())
const detailDialog = ref(false)
const detail = ref(null)
const detailGate = createLatestRequest()
const detailRequestedId = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const addCasesDialog = ref(false)
const addCaseIds = ref([])
// Serialize case-list changes before confirmation and during network requests.
const cycleMutation = ref('')
// Preserve a creation key if the response is lost; never silently issue a new key on retry.
const pendingExecutionKeys = new Map()
const diagnosticsDialog = ref(false)
const diagnosticsLoading = ref(false)
const diagnosticsError = ref('')
const diagnosticsData = ref(null)
let diagnosticsSequence = 0

function invalidateDiagnostics() { diagnosticsSequence++ }
async function openDiagnostics() {
  const request = ++diagnosticsSequence
  diagnosticsDialog.value = true
  diagnosticsLoading.value = true
  diagnosticsError.value = ''
  diagnosticsData.value = null
  try {
    const data = await testCycleApi.diagnostics(100)
    if (request !== diagnosticsSequence || !diagnosticsDialog.value) return
    if (data?.readOnly !== true || !Array.isArray(data.items)
        || !Number.isSafeInteger(data.count) || data.items.length !== data.count) {
      throw new Error('轮次诊断返回的数据格式不正确')
    }
    diagnosticsData.value = data
  } catch (error) {
    if (request === diagnosticsSequence) {
      diagnosticsError.value = error.message || '读取轮次状态诊断失败'
    }
  } finally {
    if (request === diagnosticsSequence) diagnosticsLoading.value = false
  }
}
function diagnosticCategoryLabel(category) {
  return ({ ACTIVE_ROOT_TASK: '存在活动任务', NO_ACTIVE_ROOT_TASK: '根任务已结束',
    NO_ROOT_TASK: '无任务记录' })[category] || '待核查'
}
async function openDiagnosticCycle(row) {
  const id = Number(row?.cycleId)
  if (!Number.isSafeInteger(id) || id <= 0) return
  diagnosticsDialog.value = false
  await openDetail({ id })
}

function invalidateCasePlacement() {
  placementSequence++
  if (!placementBusy.value) {
    placementLoading.value = false
    placementError.value = ''
    placementSource.value = null
    placementCandidates.value = []
    placementSelectedCycleId.value = null
    placementCreateVersionId.value = null
  }
}
function handleCasePlacementClosed() {
  // An old close transition must never reset the replacement wizard if
  // the user navigates from case A to case B within this same route.
  if (!placementDialog.value) invalidateCasePlacement()
}
function clearCasePlacementContext() {
  if (placementBusy.value || cycleMutation.value || placementDialog.value) return
  void router.replace({ name: 'test-cycles', query: {} })
}
async function openCasePlacement() {
  const id = placementCaseId.value
  if (!id || placementBusy.value || cycleMutation.value) return
  const request = ++placementSequence
  placementDialog.value = true
  placementLoading.value = true
  placementError.value = ''
  placementSource.value = null
  placementCandidates.value = []
  placementSelectedCycleId.value = null
  placementCreateVersionId.value = null
  try {
    // Never trust a case ID or coverage/version supplied solely by the URL.
    const [caseData, plannedCycles] = await Promise.all([
      testCaseApi.get(id),
      loadPagedOptions(testCycleApi.page, { status: 'PLANNED' })
    ])
    if (request !== placementSequence || !placementDialog.value
        || placementCaseId.value !== id) return
    const source = readCasePlacement(caseData, id)
    const matchingVersions = versions.value.filter(item =>
      source.generic || source.versionIds.includes(contextId(item.id)))
    if (optionsLoading.value || optionsError.value || !matchingVersions.length) {
      throw new Error('对应版本选项尚未完整加载，请先重新加载版本与环境')
    }
    placementSource.value = source
    placementCandidates.value = eligiblePlannedCycles(source, plannedCycles)
    placementSelectedCycleId.value = placementCandidates.value.length === 1
      ? placementCandidates.value[0].id : null
    placementCreateVersionId.value = matchingVersions.length === 1 ? matchingVersions[0].id : null
  } catch (error) {
    if (request === placementSequence && placementDialog.value) {
      placementError.value = error.message || '读取来源用例或计划轮次失败'
    }
  } finally {
    if (request === placementSequence) placementLoading.value = false
  }
}
async function createCycleForPlacement() {
  if (placementBusy.value || cycleMutation.value || placementLoading.value
      || placementError.value || !placementDialog.value) return
  const source = placementSource.value
  const versionId = contextId(placementCreateVersionId.value)
  if (!source || !versionId || !placementVersions.value.some(item => item.id === versionId)
      || optionsLoading.value || optionsError.value
      || !testCases.value.some(item => item.id === source.id && item.status === 'ACTIVE')) {
    ElMessage.warning('来源用例或版本选项发生变化，请重新加载后再创建轮次')
    return
  }
  placementDialog.value = false
  await router.replace({ name: 'test-cycles', query: { versionId: String(versionId) } })
  filters.versionId = versionId
  pageNum.value = 1
  openCreate()
  if (editDialog.value && !editing.value) {
    form.versionId = versionId
    form.caseIds = [source.id]
    ElMessage.info('已预选当前用例；请填写测试环境、代码版本后再创建轮次')
  }
}
async function submitCasePlacement() {
  if (placementBusy.value || cycleMutation.value || placementLoading.value
      || placementError.value || !placementDialog.value) return
  const source = placementSource.value
  const cycleId = contextId(placementSelectedCycleId.value)
  const summary = placementCandidates.value.find(item => item.id === cycleId)
  if (!source || !cycleId || !summary || placementCaseId.value !== source.id) return
  placementBusy.value = true
  cycleMutation.value = 'placement:' + cycleId
  let postAttempted = false
  let confirmed = false
  try {
    const note = source.generic
      ? '这是通用用例，加入轮次后不会产生需求覆盖快照。'
      : '只会固定该轮次所属版本的需求与设计快照。'
    await ElMessageBox.confirm(
      '将 ' + source.caseNo + ' 加入第 ' + summary.cycleNo + ' 轮「'
      + summary.cycleName + '」(' + summary.environmentName + ')。' + note
      + '确定继续吗？',
      '确认加入测试轮次',
      { type: 'warning', confirmButtonText: '确认加入', cancelButtonText: '取消' }
    )
    // Re-read both records after confirmation; another user may have
    // started the round or changed the case's requirements/revision.
    const [caseData, cycle] = await Promise.all([
      testCaseApi.get(source.id),
      testCycleApi.get(cycleId)
    ])
    const latestSource = readCasePlacement(caseData, source.id)
    if (!placementDialog.value || placementCaseId.value !== source.id
        || latestSource.generic !== source.generic
        || JSON.stringify([...latestSource.versionIds].sort()) !== JSON.stringify([...source.versionIds].sort())
        || contextId(caseData.currentRevisionId) !== contextId(source.revisionId)) {
      throw new Error('用例修订或关联版本已改变，未提交操作，请重新读取')
    }
    validateCasePlacement(latestSource, summary, cycle)
    postAttempted = true
    const result = await testCycleApi.addCases(cycleId, [source.id])
    validatePlacementResponse(latestSource, cycleId, result)
    confirmed = true
  } catch (error) {
    if (postAttempted) {
      try {
        const latest = await testCycleApi.get(cycleId)
        confirmed = Number(latest?.id) === cycleId
          && Array.isArray(latest.cases)
          && latest.cases.some(item => Number(item.testCaseId) === source.id)
      } catch (_) { /* A lost response is ambiguous; never automatically POST again. */ }
    }
    if (!confirmed && error !== 'cancel' && error !== 'close') {
      placementError.value = (error.message || '加入轮次失败') + (postAttempted
        ? '。请求可能已保存，请先重新读取轮次后再决定是否重试。'
        : '。未发出加入请求。')
      ElMessage.error(placementError.value)
    }
  } finally {
    cycleMutation.value = ''
    placementBusy.value = false
  }
  if (confirmed) {
    placementDialog.value = false
    ElMessage.success('已加入轮次并固定用例当前修订，已核对返回结果')
    await router.replace({ name: 'test-cycles', query: { versionId: String(summary.versionId) } })
    filters.versionId = summary.versionId
    pageNum.value = 1
    await loadData()
    await openDetail({ id: cycleId })
  }
}

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
const coverageReport = computed(() => {
  if (!detail.value) return null
  try { return { value: buildCycleCoverage(detail.value), error: '' } }
  catch (error) { return { value: null, error: error.message || '轮次快照数据不完整' } }
})

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (error) { return null }
}
function caseSnapshot(row) { return parseJson(row.caseSnapshotJson) || {} }
function requirementSnapshot(row) { return parseJson(row.requirementSnapshotJson) || {} }
function designSnapshot(row) { return parseJson(row.designSnapshotJson) }

async function loadOptions() {
  optionsLoading.value = true
  optionsError.value = ''
  try {
    const [versionItems, environmentItems, caseItems] = await Promise.all([
      loadPagedOptions(versionApi.page),
      environmentApi.list({ activeOnly: true }),
      loadPagedOptions(testCaseApi.page, { status: 'ACTIVE' })
    ])
    if (!Array.isArray(environmentItems)) throw new Error('环境列表响应格式不正确')
    versions.value = versionItems
    environments.value = environmentItems
    testCases.value = caseItems
  } catch (error) {
    versions.value = []
    environments.value = []
    testCases.value = []
    optionsError.value = error.message || '选项加载失败，请重试'
  } finally {
    optionsLoading.value = false
  }
}

async function loadData() {
  const requestId = listGate.begin()
  loading.value = true
  listError.value = ''
  try {
    const result = await testCycleApi.page({
      versionId: filters.versionId || undefined,
      environmentId: filters.environmentId || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
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
function search() { pageNum.value = 1; loadData() }
function resetFilters() {
  Object.assign(filters, { versionId: null, environmentId: null, status: '', keyword: '' })
  search()
}
function handleSizeChange() { pageNum.value = 1; loadData() }

function invalidateCycleEditor() {
  cycleEditorGate.invalidate()
  cycleEditorToken.value = null
  editorLoading.value = false
}
function retryCycleEditor() {
  if (editDialog.value && editing.value && editingId.value && !saving.value) {
    void openEdit({ id: editingId.value })
  }
}
function openCreate() {
  if (saving.value) return
  if (optionsError.value || optionsLoading.value) {
    ElMessage.warning('请先完整加载版本、环境与测试用例选项')
    return
  }
  cycleEditorToken.value = cycleEditorGate.begin()
  editorLoading.value = false
  editorError.value = ''
  editing.value = false
  editingId.value = null
  Object.assign(form, emptyForm(), { versionId: filters.versionId || null })
  editDialog.value = true
  formRef.value?.clearValidate()
}
async function openEdit(row) {
  if (saving.value) return
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = cycleEditorGate.begin()
  cycleEditorToken.value = token
  editing.value = true
  editingId.value = id
  editorLoading.value = true
  editorError.value = ''
  Object.assign(form, emptyForm())
  editDialog.value = true
  try {
    const data = await testCycleApi.get(id)
    if (!cycleEditorGate.isCurrent(token) || !editDialog.value) return
    if (Number(data?.id) !== id || !data.versionId || !data.environmentId) {
      throw new Error('轮次配置与当前编辑目标不一致，请重新读取')
    }
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
    formRef.value?.clearValidate()
  } catch (error) {
    if (cycleEditorGate.isCurrent(token) && editDialog.value) {
      editorError.value = error.message || '读取测试轮次配置失败'
    }
  } finally {
    if (cycleEditorGate.isCurrent(token)) editorLoading.value = false
  }
}

async function saveCycle() {
  if (saving.value) return
  const session = cycleEditorToken.value
  if (!editDialog.value || !session || !cycleEditorGate.isCurrent(session)
      || editorLoading.value || editorError.value || optionsLoading.value || optionsError.value) return
  // Prevent concurrent create/update while Element Plus validates asynchronously.
  saving.value = true
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid || !cycleEditorGate.isCurrent(session) || !editDialog.value
        || editorLoading.value || editorError.value || optionsLoading.value || optionsError.value) return
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
      if (cycleEditorGate.isCurrent(session)) ElMessage.success('测试轮次配置已更新')
    } else {
      await testCycleApi.create({
        ...payload,
        versionId: form.versionId,
        caseIds: [...form.caseIds],
        createdBy: form.createdBy || 'local-user'
      })
      if (cycleEditorGate.isCurrent(session)) ElMessage.success('测试轮次创建成功，已固定用例及需求快照')
    }
    if (cycleEditorGate.isCurrent(session)) {
      editDialog.value = false
      await loadData()
    }
  } catch (error) {
    if (cycleEditorGate.isCurrent(session)) ElMessage.error(error.message || '保存测试轮次失败')
  } finally {
    saving.value = false
  }
}

function invalidateCycleDetail() {
  detailGate.invalidate()
  detailLoading.value = false
}
function retryCycleDetail() {
  if (detailRequestedId.value && detailDialog.value) {
    openDetail({ id: detailRequestedId.value })
  }
}
async function openDetail(row) {
  const id = Number(row?.id)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const token = detailGate.begin()
  detailRequestedId.value = id
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  detailDialog.value = true
  try {
    const next = await testCycleApi.get(id)
    if (!detailGate.isCurrent(token) || !detailDialog.value) return
    if (Number(next?.id) !== id || !Array.isArray(next.cases)) {
      throw new Error('轮次详情与当前选择不一致，请重新读取')
    }
    detail.value = next
  } catch (error) {
    if (detailGate.isCurrent(token) && detailDialog.value) {
      detailError.value = error.message || '读取测试轮次详情失败'
    }
  } finally {
    if (detailGate.isCurrent(token)) detailLoading.value = false
  }
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
function actionCycleId(row) {
  const id = Number(row?.id)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
// Read the real cycle after a confirmation. A list row can become stale while
// a Runner or another browser changes its state.
async function readCycleForAction(id, allowedStatuses) {
  const current = await testCycleApi.get(id)
  if (Number(current?.id) !== id || !Array.isArray(current?.cases)) {
    throw new Error('服务端轮次详情不完整，未提交操作，请重新加载')
  }
  if (detailDialog.value && detail.value?.id === id) detail.value = current
  if (!allowedStatuses.includes(current.status)) {
    ElMessage.warning('轮次状态已变化，未提交操作，请核对最新状态')
    return null
  }
  return current
}
async function reconcileCycleAction(id) {
  try {
    const current = await testCycleApi.get(id)
    if (Number(current?.id) !== id || !Array.isArray(current?.cases)) {
      throw new Error('读取轮次状态不完整')
    }
    if (detailDialog.value && detail.value?.id === id) {
      detail.value = current
      detailError.value = ''
    }
  } catch (error) {
    if (detailDialog.value && detail.value?.id === id) {
      detailError.value = (error.message || '无法核对轮次状态') + '，请手动刷新详情'
    }
    ElMessage.warning('轮次状态暂无法确认，请刷新后核对，避免重复操作')
  }
  await loadData()
}
function currentActionKey(key) {
  if (pendingExecutionKeys.has(key)) return pendingExecutionKeys.get(key)
  const storageName = 'dpm:execution-request:' + key
  // This is a random idempotency marker, not a credential. Keep it for this
  // browser tab so refreshing after a lost 201 response cannot generate a
  // different creation request and accidentally start a second execution.
  let value = null
  try {
    const saved = window.sessionStorage.getItem(storageName)
    if (/^web-[0-9]{10,17}-[a-z0-9]{1,10}$/.test(saved || '')) value = saved
  } catch (_) { /* Private browsing may disable sessionStorage. */ }
  if (!value) value = createIdempotencyKey()
  pendingExecutionKeys.set(key, value)
  try { window.sessionStorage.setItem(storageName, value) } catch (_) { /* memory fallback */ }
  return value
}
function clearActionKey(key) {
  pendingExecutionKeys.delete(key)
  try { window.sessionStorage.removeItem('dpm:execution-request:' + key) }
  catch (_) { /* storage may be disabled */ }
}
function validateCreatedTask(response, cycleId, taskType, cycleCaseId = null) {
  const task = response?.task
  if (!Number.isSafeInteger(Number(task?.id)) || Number(task.id) <= 0
      || Number(task.cycleId) !== cycleId || task.taskType !== taskType
      || (cycleCaseId !== null && Number(task.cycleCaseId) !== cycleCaseId)) {
    throw new Error('执行任务返回信息与当前操作不一致；请核对执行任务列表')
  }
}
async function createCycleExecution() {
  const id = actionCycleId(detail.value)
  if (cycleMutation.value || !detailDialog.value || !id
      || detail.value?.status !== 'RUNNING') return
  cycleMutation.value = 'create-cycle:' + id
  const key = 'cycle:' + id
  try {
    await ElMessageBox.confirm(
      '将为本轮所有测试用例创建执行子任务。已存在未完成任务时，系统会阻止重复创建。确定继续吗？',
      '创建整轮执行任务', { type: 'warning', confirmButtonText: '创建任务', cancelButtonText: '取消' }
    )
    const current = await readCycleForAction(id, ['RUNNING'])
    if (!current) return
    if (!current.cases.length) throw new Error('当前轮次没有测试用例，未创建执行任务')
    const response = await executionTaskApi.createCycle(id, {
      idempotencyKey: currentActionKey(key), requestedBy: 'local-user', triggerSource: 'USER'
    })
    validateCreatedTask(response, id, 'EXECUTE_CYCLE')
    clearActionKey(key)
    ElMessage.success('整轮执行任务已创建')
    detailDialog.value = false
    await loadData()
    await router.push('/execution-tasks')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error((error.message || '创建整轮执行任务失败')
        + '；请核对执行任务列表。重试将沿用同一幂等键，不会自动重复创建')
      await reconcileCycleAction(id)
    }
  } finally {
    cycleMutation.value = ''
  }
}
async function createCaseExecution(row) {
  const id = actionCycleId(detail.value)
  const caseId = actionCycleId(row)
  if (cycleMutation.value || !detailDialog.value || !id || !caseId
      || detail.value?.status !== 'RUNNING'
      || !detail.value.cases?.some(item => Number(item.id) === caseId)) return
  cycleMutation.value = 'create-case:' + caseId
  const key = 'case:' + id + ':' + caseId
  try {
    const current = await readCycleForAction(id, ['RUNNING'])
    if (!current) return
    if (!current.cases.some(item => Number(item.id) === caseId)) {
      ElMessage.warning('用例已不属于本轮，未创建执行任务')
      return
    }
    const response = await executionTaskApi.createCase(id, caseId, {
      idempotencyKey: currentActionKey(key), requestedBy: 'local-user', triggerSource: 'USER'
    })
    validateCreatedTask(response, id, 'EXECUTE_CASE', caseId)
    clearActionKey(key)
    ElMessage.success('单用例执行任务已创建')
    detailDialog.value = false
    await loadData()
    await router.push('/execution-tasks')
  } catch (error) {
    ElMessage.error((error.message || '创建单用例执行任务失败')
      + '；请核对执行任务列表。重试将沿用同一幂等键，不会自动重复创建')
    await reconcileCycleAction(id)
  } finally {
    cycleMutation.value = ''
  }
}
function openAddCases() {
  if (cycleMutation.value || !detailDialog.value || detail.value?.status !== 'PLANNED') return
  if (optionsError.value || optionsLoading.value) {
    ElMessage.warning('请先完整加载测试用例选项')
    return
  }
  addCaseIds.value = []
  addCasesDialog.value = true
}
async function saveAddedCases() {
  if (cycleMutation.value || !detailDialog.value || !addCasesDialog.value
      || detail.value?.status !== 'PLANNED' || optionsLoading.value || optionsError.value) return
  const cycleId = Number(detail.value.id)
  const caseIds = [...addCaseIds.value]
  const allowed = new Set(addableCases.value.map(item => item.id))
  if (!caseIds.length || new Set(caseIds).size !== caseIds.length
      || caseIds.some(id => !allowed.has(id))) {
    ElMessage.warning('请重新选择尚未加入本轮的有效测试用例')
    return
  }
  // Freeze the target and selection. The dialog must not be closed or resubmitted
  // until the request finishes, including on slow networks.
  cycleMutation.value = 'add'
  try {
    const updated = await testCycleApi.addCases(cycleId, caseIds)
    if (Number(updated?.id) !== cycleId || !Array.isArray(updated?.cases)) {
      throw new Error('加入用例的服务响应不完整，请刷新轮次后核对')
    }
    if (detailDialog.value && detail.value?.id === cycleId) {
      addCasesDialog.value = false
      addCaseIds.value = []
      await openDetail({ id: cycleId })
    }
    await loadData()
    ElMessage.success('测试用例已加入，本轮已固定当前修订及需求快照')
  } catch (error) {
    ElMessage.error((error.message || '加入测试用例失败')
      + '；正在重新读取轮次，以免重复加入已保存的用例')
    // A transport error is ambiguous: the server may have committed the POST.
    // Re-read the cycle before accepting a user retry.
    if (detailDialog.value && detail.value?.id === cycleId) await openDetail({ id: cycleId })
  } finally {
    cycleMutation.value = ''
  }
}
async function removeCase(row) {
  if (cycleMutation.value || !detailDialog.value || detail.value?.status !== 'PLANNED') return
  const cycleId = Number(detail.value.id)
  const caseId = Number(row?.id)
  if (!Number.isSafeInteger(caseId) || caseId <= 0
      || !(detail.value.cases || []).some(item => item.id === caseId)) return
  // Lock before opening confirmation so double-clicks cannot show two prompts.
  cycleMutation.value = 'remove:' + caseId
  try {
    await ElMessageBox.confirm(
      '移除后，该用例不再属于当前计划中的测试轮次。此操作不会删除原测试用例。',
      '确认移除用例', { type: 'warning', confirmButtonText: '确认移除', cancelButtonText: '取消' }
    )
    if (!detailDialog.value || detail.value?.id !== cycleId
        || detail.value?.status !== 'PLANNED') return
    const updated = await testCycleApi.removeCase(cycleId, caseId)
    if (Number(updated?.id) !== cycleId || !Array.isArray(updated?.cases)) {
      throw new Error('移除用例的服务响应不完整，请刷新轮次后核对')
    }
    await openDetail({ id: cycleId })
    await loadData()
    ElMessage.success('已从本轮移除测试用例')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error((error.message || '移除用例失败') + '；正在重新读取轮次状态')
      if (detailDialog.value && detail.value?.id === cycleId) await openDetail({ id: cycleId })
    }
  } finally {
    cycleMutation.value = ''
  }
}
async function startCycle(row) {
  const id = actionCycleId(row)
  if (!id || cycleMutation.value || row?.status !== 'PLANNED') return
  // Lock before the confirmation prompt (not after the async GET or POST).
  cycleMutation.value = 'start:' + id
  try {
    await ElMessageBox.confirm(
      '开始后将锁定本轮用例清单，不再允许修改环境、代码版本或增删用例。确定开始测试吗？',
      '开始测试轮次', { type: 'warning', confirmButtonText: '开始测试', cancelButtonText: '再检查一下' }
    )
    const current = await readCycleForAction(id, ['PLANNED'])
    if (!current) {
      await loadData()
      return
    }
    if (!current.cases.length) throw new Error('本轮尚无测试用例，未发送开始请求')
    const updated = await testCycleApi.start(id)
    if (Number(updated?.id) !== id || updated.status !== 'RUNNING') {
      throw new Error('开始轮次的响应不匹配，请核对轮次最新状态')
    }
    if (detailDialog.value && detail.value?.id === id) detail.value = updated
    await loadData()
    ElMessage.success('测试轮次已开始')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error((error.message || '开始测试失败') + '；正在核对最新状态，避免重复开始')
      await reconcileCycleAction(id)
    }
  } finally {
    cycleMutation.value = ''
  }
}
async function abortCycle(row) {
  const id = actionCycleId(row)
  if (!id || cycleMutation.value || !['PLANNED', 'RUNNING'].includes(row?.status)) return
  cycleMutation.value = 'abort:' + id
  try {
    await ElMessageBox.confirm(
      '终止后本轮不再接受执行操作。已有记录会保留，确定终止吗？',
      '终止测试轮次', { type: 'warning', confirmButtonText: '确认终止', cancelButtonText: '取消' }
    )
    const current = await readCycleForAction(id, ['PLANNED', 'RUNNING'])
    if (!current) {
      await loadData()
      return
    }
    const updated = await testCycleApi.abort(id)
    if (Number(updated?.id) !== id || updated.status !== 'ABORTED') {
      throw new Error('终止轮次的响应不匹配，请核对轮次最新状态')
    }
    if (detailDialog.value && detail.value?.id === id) detail.value = updated
    await loadData()
    ElMessage.success('测试轮次已终止，原执行记录保留')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error((error.message || '终止轮次失败') + '；正在核对最新状态，避免重复终止')
      await reconcileCycleAction(id)
    }
  } finally {
    cycleMutation.value = ''
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
watch(() => route.query.caseId, () => {
  if (placementBusy.value) return
  if (placementDialog.value) placementDialog.value = false
  invalidateCasePlacement()
  // Vue reuses this view when only ?caseId changes. onMounted does not
  // run again; open the new source automatically after invalidating A.
  if (placementCaseId.value && !optionsLoading.value && !optionsError.value) {
    void openCasePlacement()
  }
})
watch(() => route.query.versionId, value => {
  const id = contextId(value)
  if (filters.versionId === id) return
  filters.versionId = id
  pageNum.value = 1
  loadData()
})
onMounted(async () => {
  filters.versionId = contextId(route.query.versionId)
  await Promise.all([loadOptions(), loadData()])
  // A user arriving via "加入轮次" expects the placement wizard, not merely
  // a banner requiring a second click. Loading options first is mandatory;
  // source case/version identity is verified again inside openCasePlacement.
  if (placementCaseId.value && !optionsLoading.value && !optionsError.value) {
    await openCasePlacement()
  }
})
onUnmounted(() => {
  cycleEditorGate.invalidate()
  detailGate.invalidate()
  listGate.invalidate()
  invalidateCasePlacement()
})
</script>

<style scoped>
.cycle-coverage-panel {
  border: 1px solid #e4eaf3;
  border-radius: 9px;
  padding: 12px 14px;
  margin: 15px 0 16px;
  background: #fbfcff;
}
.coverage-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
.coverage-stat-grid > div { border: 1px solid #eef1f6; border-radius: 7px; padding: 10px; background: #fff; }
.coverage-stat-grid strong { display: block; font-size: 17px; color: #2a466e; }
.coverage-stat-grid span { font-size: 11px; color: #718096; line-height: 1.5; }
.coverage-note { font-size: 11px; color: #6b788c; margin: 9px 0 0; line-height: 1.7; }
@media (max-width: 760px) { .coverage-stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
.diagnostics-actions { display: flex; flex-wrap: wrap; gap: 9px; }
.diagnostics-content { min-height: 120px; }
.diagnostics-content > .el-alert { margin-bottom: 14px; }
.diagnostics-spaced { margin-top: 10px; }
.diagnostics-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 12px; margin: 10px 0 16px; color: #53627b; }
.diagnostics-summary strong { font-size: 14px; color: #29364c; }
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
