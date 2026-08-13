import { defineStore } from 'pinia'
import { computed,ref } from 'vue'
import { createOrderMockSession,type OrderScenarioName } from '../../../../mock/handlers/order-handler'
import { setCurrentOrderRole } from './order-access'
import type { OrderActor,OrderDetailResult,OrderListRow,OrderQuery,PageResult } from '../types'

const emptyResult=():PageResult<OrderListRow>=>({items:[],total:0,page:1,pageSize:30})
export const useOrderStore=defineStore('orders',()=>{
  const scenario=ref<OrderScenarioName>('normal');const actor=ref<OrderActor>({role:'super-admin',actorId:'admin-demo'});const query=ref<OrderQuery>({page:1,pageSize:30});const result=ref<PageResult<OrderListRow>>(emptyResult());const detail=ref<OrderDetailResult|null>(null);const loading=ref(false);const saving=ref(false);const error=ref<string|null>(null);let session=createOrderMockSession('normal');let requestVersion=0
  const canOutput=computed(()=>['super-admin','sales-supervisor','salesperson'].includes(actor.value.role));const isEmpty=computed(()=>!loading.value&&!error.value&&result.value.total===0)
  async function load():Promise<void>{const version=++requestVersion;loading.value=true;error.value=null;try{const response=await session.run(()=>session.service.listOrders(actor.value,query.value));if(version===requestVersion)result.value=response}catch(caught){if(version===requestVersion){error.value=caught instanceof Error?caught.message:'订单数据加载失败';result.value={...emptyResult(),page:query.value.page??1,pageSize:query.value.pageSize??30}}}finally{if(version===requestVersion)loading.value=false}}
  async function setScenario(next:OrderScenarioName):Promise<void>{scenario.value=next;actor.value=next==='permission-denied'?{role:'super-admin',actorId:'admin-demo'}:{role:'super-admin',actorId:'admin-demo'};setCurrentOrderRole(actor.value.role);session=createOrderMockSession(next);detail.value=null;await load()}
  async function setRole(role:OrderActor['role']):Promise<void>{actor.value={role,actorId:`${role}-demo`};setCurrentOrderRole(role);detail.value=null;await load()}
  async function applyQuery(next:OrderQuery):Promise<void>{query.value={...next,page:next.page??1,pageSize:next.pageSize??30};await load()}
  async function setPage(page:number):Promise<void>{query.value={...query.value,page:Math.max(1,page)};await load()}
  async function loadDetail(id:string):Promise<void>{loading.value=true;error.value=null;try{detail.value=await session.run(()=>session.service.getOrderDetail(actor.value,id))}catch(caught){error.value=caught instanceof Error?caught.message:'订单详情加载失败';detail.value=null}finally{loading.value=false}}
  function exportCsv(selected:string[]):string{return session.service.exportOrdersCsv(actor.value,query.value,selected)}
  async function confirmPrint(ids:string[],requestId:string):Promise<void>{saving.value=true;try{await session.run(()=>session.service.printOrders(actor.value,ids,requestId));await load();if(detail.value&&ids.includes(detail.value.order.id))await loadDetail(detail.value.order.id)}finally{saving.value=false}}
  return{scenario,actor,query,result,detail,loading,saving,error,canOutput,isEmpty,load,setScenario,setRole,applyQuery,setPage,loadDetail,exportCsv,confirmPrint}
})

