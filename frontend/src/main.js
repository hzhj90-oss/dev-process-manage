import { createApp } from 'vue'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './style.css'

// 页面内部按需引入 Element Plus 组件和指令，不在首屏注册整套组件。
createApp(App).use(router).mount('#app')