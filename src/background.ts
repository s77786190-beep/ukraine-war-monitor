import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import {refreshSources} from "./monitor";
export const TASK="KOSTROMA_MONITOR_REFRESH";
TaskManager.defineTask(TASK,async()=>{try{await refreshSources();return BackgroundTask.BackgroundTaskResult.Success}catch{return BackgroundTask.BackgroundTaskResult.Failed}});
export async function setBackground(on:boolean,minutes:number){const registered=await TaskManager.isTaskRegisteredAsync(TASK);if(registered)await BackgroundTask.unregisterTaskAsync(TASK);if(on){const status=await BackgroundTask.getStatusAsync();if(status!==BackgroundTask.BackgroundTaskStatus.Available)throw new Error("Фоновое выполнение недоступно в системе.");await BackgroundTask.registerTaskAsync(TASK,{minimumInterval:Math.max(15,minutes)});}}
export async function backgroundEnabled(){return TaskManager.isTaskRegisteredAsync(TASK)}
