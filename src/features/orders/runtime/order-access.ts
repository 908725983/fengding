import type { OrderRole } from '../types'

let currentRole:OrderRole='super-admin'
export function setCurrentOrderRole(role:OrderRole):void{currentRole=role}
export function canCurrentRoleAccessOrders():boolean{return ['super-admin','sales-supervisor','salesperson','warehouse','finance'].includes(currentRole)}
export function canCurrentRoleManageOrders():boolean{return ['super-admin','sales-supervisor','salesperson'].includes(currentRole)}
export function guardOrderSubroute(path:string):true|string{if(path.startsWith('/share/orders/'))return true;if(!path.startsWith('/orders'))return true;if(!canCurrentRoleAccessOrders())return '/dashboard?denied=orders';if(path.startsWith('/orders/differences')&&!['super-admin','sales-supervisor'].includes(currentRole))return '/orders?denied=difference';if(path==='/orders/returns/new'&&!['super-admin','salesperson'].includes(currentRole))return '/orders/returns?denied=create-return';if(/^\/orders\/returns\/[^/]+\/edit$/.test(path)&&!['super-admin','sales-supervisor'].includes(currentRole))return '/orders/returns?denied=edit-return';if((path==='/orders/new'||/^\/orders\/(?!returns\/)[^/]+\/edit$/.test(path))&&!canCurrentRoleManageOrders())return '/orders?denied=manage';return true}
