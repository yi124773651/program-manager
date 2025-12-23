<template>
  <div class="maintenance-overlay" @click.self="$emit('close')">
    <div class="maintenance-dialog">
      <div class="maintenance-header">
        <h2>程序维护</h2>
        <button class="close-btn" @click="$emit('close')">
          <XIcon :size="20" />
        </button>
      </div>

      <!-- 标签页切换 -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'cleanup' }"
          @click="activeTab = 'cleanup'"
        >
          清理无效项
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'update' }"
          @click="activeTab = 'update'"
        >
          更新检测
        </button>
      </div>

      <div class="maintenance-content">
        <!-- 标签页 1: 清理无效项 -->
        <div v-if="activeTab === 'cleanup'" class="tab-content">
          <div class="section">
            <div class="section-header">
              <h3>检测失效程序</h3>
              <p class="section-desc">扫描所有程序，找出文件不存在或无法访问的项目</p>
            </div>

            <div class="action-panel">
              <button
                class="btn-primary"
                :disabled="maintenanceStore.validating"
                @click="handleValidate"
              >
                <span v-if="!maintenanceStore.validating">开始检测</span>
                <span v-else>检测中...</span>
              </button>
              <div class="info-text">
                共 {{ totalApps }} 个程序
              </div>
            </div>

            <!-- 进度条 -->
            <div v-if="maintenanceStore.validating" class="progress-bar">
              <div class="progress-fill" :style="{ width: maintenanceStore.validationProgress + '%' }"></div>
              <span class="progress-text">{{ maintenanceStore.validationProgress }}%</span>
            </div>

            <!-- 检测结果 -->
            <div v-if="maintenanceStore.validationResults.length > 0" class="results">
              <div class="results-header">
                <h4>检测结果</h4>
                <div class="results-summary">
                  发现 <strong>{{ maintenanceStore.invalidAppCount }}</strong> 个失效项
                </div>
              </div>

              <div v-if="maintenanceStore.invalidAppCount > 0" class="results-list">
                <div
                  v-for="result in maintenanceStore.invalidApps"
                  :key="result.appId"
                  class="result-item invalid"
                >
                  <div class="result-icon">❌</div>
                  <div class="result-info">
                    <div class="result-name">{{ result.appName }}</div>
                    <div class="result-reason">{{ result.reason || '文件不存在' }}</div>
                  </div>
                  <div v-if="result.pathType === 'network'" class="result-badge">网络路径</div>
                </div>
              </div>

              <div v-else class="no-issues">
                ✅ 所有程序都正常，没有发现失效项
              </div>

              <!-- 批量删除按钮 -->
              <div v-if="maintenanceStore.invalidAppCount > 0" class="action-buttons">
                <button
                  class="btn-danger"
                  :disabled="maintenanceStore.batchOperating"
                  @click="handleBatchDelete"
                >
                  批量删除失效项 ({{ maintenanceStore.invalidAppCount }})
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 标签页 2: 更新检测 -->
        <div v-if="activeTab === 'update'" class="tab-content">
          <div class="section">
            <div class="section-header">
              <h3>程序更新检测</h3>
              <p class="section-desc">对比文件元数据和版本号，检测程序是否有更新</p>
            </div>

            <!-- 初始化提示 -->
            <div v-if="maintenanceStore.uninitializedCount > 0" class="warning-banner">
              <AlertCircleIcon :size="18" />
              <div class="warning-content">
                <div class="warning-title">需要初始化基准数据</div>
                <div class="warning-desc">
                  发现 <strong>{{ maintenanceStore.uninitializedCount }}</strong> 个程序未初始化基准数据，需要初始化后才能检测更新
                </div>
              </div>
              <button
                class="btn-secondary"
                :disabled="maintenanceStore.batchOperating"
                @click="handleInitBaselines"
              >
                立即初始化
              </button>
            </div>

            <!-- 初始化进度 -->
            <div v-if="maintenanceStore.batchOperating && maintenanceStore.batchTotal > 0" class="progress-section">
              <div class="progress-label">
                初始化中... {{ maintenanceStore.batchProgress }}/{{ maintenanceStore.batchTotal }}
              </div>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{ width: (maintenanceStore.batchProgress / maintenanceStore.batchTotal * 100) + '%' }"
                ></div>
              </div>
            </div>

            <!-- 检测更新 -->
            <div class="action-panel">
              <button
                class="btn-primary"
                :disabled="maintenanceStore.checkingUpdates || maintenanceStore.uninitializedCount === totalApps"
                @click="handleCheckUpdates"
              >
                <span v-if="!maintenanceStore.checkingUpdates">开始检测更新</span>
                <span v-else>检测中...</span>
              </button>
              <div class="info-text">
                共 {{ totalApps - maintenanceStore.uninitializedCount }} 个程序已初始化
              </div>
            </div>

            <!-- 检测进度 -->
            <div v-if="maintenanceStore.checkingUpdates" class="progress-bar">
              <div class="progress-fill" :style="{ width: maintenanceStore.updateCheckProgress + '%' }"></div>
              <span class="progress-text">{{ maintenanceStore.updateCheckProgress }}%</span>
            </div>

            <!-- 更新检测结果 -->
            <div v-if="maintenanceStore.updateResults.length > 0" class="results">
              <div class="results-header">
                <h4>检测结果</h4>
                <div class="results-summary">
                  发现 <strong>{{ maintenanceStore.updateCount }}</strong> 个可能的更新
                </div>
              </div>

              <div v-if="maintenanceStore.updateCount > 0" class="results-list">
                <div
                  v-for="result in maintenanceStore.appsWithUpdates"
                  :key="result.appId"
                  class="result-item update"
                  :class="'confidence-' + result.confidence"
                >
                  <div class="result-icon">
                    <span v-if="result.confidence === 'high'">🔵</span>
                    <span v-else-if="result.confidence === 'medium'">🟡</span>
                    <span v-else>⚪</span>
                  </div>
                  <div class="result-info">
                    <div class="result-name">{{ result.appName }}</div>
                    <div class="result-details">
                      <span v-if="result.details.oldVersion && result.details.newVersion">
                        版本变更: {{ result.details.oldVersion }} → {{ result.details.newVersion }}
                      </span>
                      <span v-else-if="result.details.fileChanged">
                        文件已修改
                        <span v-if="result.details.sizeChanged && result.details.modifiedTimeChanged">
                          (大小+时间变更)
                        </span>
                        <span v-else-if="result.details.sizeChanged">(大小变更)</span>
                        <span v-else-if="result.details.modifiedTimeChanged">(时间变更)</span>
                      </span>
                    </div>
                  </div>
                  <div class="result-badge" :class="'badge-' + result.confidence">
                    {{ confidenceLabel(result.confidence) }}
                  </div>
                </div>
              </div>

              <div v-else class="no-issues">
                ✅ 所有程序都是最新版本，没有发现更新
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="maintenance-footer">
        <button class="btn-secondary" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { XIcon, AlertCircleIcon } from 'lucide-vue-next'
import { useMaintenanceStore } from '@/stores/maintenanceStore'
import { useAppStore } from '@/stores/appStore'

defineEmits(['close'])

const maintenanceStore = useMaintenanceStore()
const appStore = useAppStore()

const activeTab = ref<'cleanup' | 'update'>('cleanup')

const totalApps = computed(() => Object.keys(appStore.config.apps).length)

const confidenceLabel = (confidence: string) => {
  switch (confidence) {
    case 'high':
      return '高可信度'
    case 'medium':
      return '中等可信度'
    case 'low':
      return '低可信度'
    default:
      return '未知'
  }
}

const handleValidate = async () => {
  try {
    await maintenanceStore.validateAllApps()
  } catch (error) {
    alert(`检测失败: ${error}`)
  }
}

const handleBatchDelete = async () => {
  if (!confirm(`确定要删除 ${maintenanceStore.invalidAppCount} 个失效项吗？此操作不可撤销。`)) {
    return
  }

  try {
    const result = await maintenanceStore.batchDeleteInvalidApps()
    alert(`成功删除 ${result?.succeeded ?? 0} 个失效项`)
  } catch (error) {
    alert(`删除失败: ${error}`)
  }
}

const handleInitBaselines = async () => {
  try {
    const result = await maintenanceStore.initAllUpdateBaselines()
    alert(`初始化完成！成功: ${result.succeeded}，失败: ${result.failed}`)
  } catch (error) {
    alert(`初始化失败: ${error}`)
  }
}

const handleCheckUpdates = async () => {
  try {
    await maintenanceStore.checkAllUpdates()
  } catch (error) {
    alert(`检测失败: ${error}`)
  }
}
</script>

<style scoped>
.maintenance-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.maintenance-dialog {
  width: 900px;
  max-width: 95vw;
  max-height: 85vh;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.maintenance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.maintenance-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* 标签页 */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  padding: 0 24px;
}

.tab {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

/* 内容区 */
.maintenance-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-content {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section {
  margin-bottom: 24px;
}

.section-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

/* 操作面板 */
.action-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.info-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 警告横幅 */
.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 8px;
  margin-bottom: 16px;
}

.warning-banner svg {
  color: #ff9500;
  flex-shrink: 0;
  margin-top: 2px;
}

.warning-content {
  flex: 1;
}

.warning-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.warning-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.warning-desc strong {
  color: #ff9500;
}

/* 进度条 */
.progress-section {
  margin-bottom: 16px;
}

.progress-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.progress-bar {
  position: relative;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.3s;
  border-radius: 4px;
}

.progress-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 600;
}

/* 结果区域 */
.results {
  margin-top: 24px;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.results-header h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.results-summary {
  font-size: 14px;
  color: var(--text-secondary);
}

.results-summary strong {
  color: var(--primary-color);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.result-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.result-reason,
.result-details {
  font-size: 13px;
  color: var(--text-secondary);
}

.result-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.result-item.invalid .result-badge {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.result-badge.badge-high {
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}

.result-badge.badge-medium {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.result-badge.badge-low {
  background: rgba(142, 142, 147, 0.1);
  color: #8e8e93;
}

.no-issues {
  text-align: center;
  padding: 32px;
  font-size: 14px;
  color: var(--text-secondary);
}

/* 按钮 */
.action-buttons {
  display: flex;
  gap: 12px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color);
}

.btn-danger {
  background: #ff3b30;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #e53e3e;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 底部 */
.maintenance-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}
</style>
