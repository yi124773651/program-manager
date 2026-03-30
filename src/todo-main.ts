import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TodoWindow from './TodoWindow.vue'
import './style.css'

const pinia = createPinia()
const app = createApp(TodoWindow)

app.use(pinia)
app.mount('#app')
