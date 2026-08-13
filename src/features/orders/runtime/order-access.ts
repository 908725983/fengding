import type { OrderRole } from '../types'

let currentRole:OrderRole='super-admin'
export function setCurrentOrderRole(role:OrderRole):void{currentRole=role}
export function canCurrentRoleAccessOrders():boolean{return ['super-admin','sales-supervisor','salesperson','warehouse','finance'].includes(currentRole)}
export function guardOrderSubroute(path:string):true|string{if(!path.startsWith('/orders'))return true;if(!canCurrentRoleAccessOrders())return '/dashboard?denied=orders';return true}

