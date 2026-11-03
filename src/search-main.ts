import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SearchWindow from './SearchWindow.vue'
import './style.css'
import { disableNativeContextMenu } from './services/windowInteractionService'

disableNativeContextMenu()

const pinia = createPinia()
const app = createApp(SearchWindow)

app.use(pinia)
app.mount('#app')
