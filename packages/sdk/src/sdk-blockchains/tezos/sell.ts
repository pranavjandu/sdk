import { SellRequest as TezosSellRequest, sell } from "tezos/sdk/order/sell"
// eslint-disable-next-line camelcase
import { Provider, get_public_key } from "tezos/sdk/common/base"
// eslint-disable-next-line camelcase
import { pk_to_pkh } from "tezos/sdk/main"
import { Action } from "@rarible/action"
import { OrderPayout } from "@rarible/api-client"
import { toBigNumber, toOrderId } from "@rarible/types"
import { PrepareSellRequest, PrepareSellResponse, SellRequest, SellRequestCurrency } from "../../order/sell/domain"
import { ItemType, TezosOrder } from "./domain"


export class Sell {
	constructor(
		private provider: Provider
	) {
		this.sell = this.sell.bind(this)
	}

	parseTakeAssetType(type: SellRequestCurrency) {
		switch (type["@type"]) {
			case "XTZ": {
				return {
					asset_class: type["@type"],
				}
			}
			case "FA_1_2": {
				return {
					asset_class: type["@type"],
					contract: type.contract,
				}
			}
			default: {
				throw new Error("Unsupported take asset type")
			}
		}
	}

	async getPayouts(requestPayouts?: OrderPayout[]) {
		let payouts = requestPayouts || []

		if (!Array.isArray(payouts) || payouts.length === 0) {
			return [{
				account: pk_to_pkh(await this.getMakerPublicKey()),
				value: 10000n,
			}]
		}

		return payouts.map(p => ({
			account: pk_to_pkh(p.account),
			value: BigInt(p.value),
		})) || []
	}

	async getMakerPublicKey(): Promise<string> {
		const maker = await get_public_key(this.provider)
		if (!maker) {
			throw new Error("Maker does not exist")
		}
		return maker
	}

	private async getItem(itemId: string): Promise<ItemType> {
		const response = await fetch(`${this.provider.api}/items/${itemId}`)
		return await response.json()
	}

	async sell(prepareSellRequest: PrepareSellRequest): Promise<PrepareSellResponse> {
		if (!prepareSellRequest.itemId.startsWith("TEZOS")) {
			throw new Error("Not a tezos item")
		}
		const item = await this.getItem(prepareSellRequest.itemId.substring(6))
		const makerPublicKey = await this.getMakerPublicKey()

		const submit = Action.create({
			id: "send-tx" as const,
			run: async (request: SellRequest) => {
				const tezosRequest : TezosSellRequest = {
					maker: pk_to_pkh(makerPublicKey),
					maker_edpk: makerPublicKey,
					make_asset_type: {
						asset_class: "FA_2",
						contract: item.contract,
						token_id: BigInt(item.tokenId),
					},
					take_asset_type: this.parseTakeAssetType(request.currency),
					amount: BigInt(request.amount),
					price: BigInt(request.price),
					payouts: await this.getPayouts(request.payouts),
					origin_fees: request.originFees?.map(p => ({
						account: p.account,
						value: BigInt(p.value),
					})) || [],
				}

				const sellOrder: TezosOrder = await sell(this.provider, tezosRequest)

				return toOrderId(`TEZOS:${sellOrder.hash}`)
			},
		})

		return {
			maxAmount: toBigNumber(item.supply),
			supportedCurrencies: [{
				blockchain: "TEZOS",
				type: "NATIVE",
			}],
			baseFee: parseInt(this.provider.config.fees.toString()),
			submit,
		}
	}
}