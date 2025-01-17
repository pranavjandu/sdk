import { Web3Ethereum } from "@rarible/web3-ethereum"
import { EthereumWallet } from "@rarible/sdk-wallet"
import { toAddress, toUnionAddress } from "@rarible/types"
import type { ItemId } from "@rarible/api-client"
import { Blockchain, BlockchainGroup } from "@rarible/api-client"
import { createRaribleSdk } from "../../index"
import { LogsLevel } from "../../domain"
import { MaxFeesBasePointSupport } from "../../types/order/fill/domain"
import { retry } from "../../common/retry"
import { MintType } from "../../types/nft/mint/prepare"
import { awaitItem } from "../../common/test/await-item"
import { awaitStock } from "../../common/test/await-stock"
import { initProviders } from "./test/init-providers"
import { convertEthereumCollectionId, convertEthereumContractAddress, convertEthereumToUnionAddress } from "./common"
import { DEV_PK_1, DEV_PK_2 } from "./test/common"

describe("Create & fill orders with order data v3", () => {
	const { web31, web32, wallet1 } = initProviders({ pk1: DEV_PK_1, pk2: DEV_PK_2 })
	const ethereum1 = new Web3Ethereum({ web3: web31 })
	const ethereum2 = new Web3Ethereum({ web3: web32 })
	const sdk1 = createRaribleSdk(new EthereumWallet(ethereum1), "development", {
		logs: LogsLevel.DISABLED,
		blockchain: {
			[BlockchainGroup.ETHEREUM]: {
				marketplaceMarker: "0x00000000000000000000000000000000000000000000face",
				useDataV3: true,
			},
		},
	})
	const sdk2 = createRaribleSdk(new EthereumWallet(ethereum2), "development", {
		logs: LogsLevel.DISABLED,
		blockchain: {
			[BlockchainGroup.ETHEREUM]: {
				marketplaceMarker: "0x00000000000000000000000000000000000000000000dead",
				useDataV3: true,
			},
		},
	})

	const sdk2WithoutMarker = createRaribleSdk(new EthereumWallet(ethereum2), "development", {
		logs: LogsLevel.DISABLED,
		blockchain: {
			[BlockchainGroup.ETHEREUM]: {
				useDataV3: true,
			},
		},
	})

	const erc20 = toAddress("0xA4A70E8627e858567a9f1F08748Fe30691f72b9e")
	const erc20ContractAddress = convertEthereumContractAddress(erc20, Blockchain.ETHEREUM)
	// const testErc20 = getTestErc20Contract(web32, erc20)

	const erc721Address = toAddress("0x64F088254d7EDE5dd6208639aaBf3614C80D396d")

	test("erc721 sell/buy with default marketplace marker", async () => {
		const wallet1Address = wallet1.getAddressString()
		const itemId = await mint()

		const sellAction = await sdk1.order.sell.prepare({ itemId: itemId })
		expect(sellAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.REQUIRED)
		const orderId = await sellAction.submit({
			amount: 1,
			price: "0.0000004",
			currency: {
				"@type": "ETH",
			},
			originFees: [{
				account: toUnionAddress("ETHEREUM:"+wallet1Address),
				value: 10,
			}],
			maxFeesBasePoint: 500,
		})


		const nextStock = "1"
		await awaitStock(sdk1, orderId, nextStock)

		const updateAction = await sdk1.order.sellUpdate.prepare({ orderId })
		await updateAction.submit({ price: "0.0000003" })

		await sdk1.apis.order.getOrderById({ id: orderId })

		const fillAction = await sdk2WithoutMarker.order.buy.prepare({ orderId })
		expect(fillAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.IGNORED)
		const tx = await fillAction.submit({ amount: 1 })
		expect(tx.transaction.data.endsWith("000009616c6c64617461")).toEqual(true)
		await tx.wait()

		const nextStock2 = "0"
		await awaitStock(sdk1, orderId, nextStock2)
		// await retry(15, 2000, async () => {
		// 	const order = await sdk1.apis.order.getOrderById({ id: orderId })
		// 	expect(order.status).toEqual("FILLED")
		// })
	})

	test("erc721 sell/buy", async () => {
		const wallet1Address = wallet1.getAddressString()
		const itemId = await mint()

		const sellAction = await sdk1.order.sell.prepare({ itemId: itemId })
		expect(sellAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.REQUIRED)
		const orderId = await sellAction.submit({
			amount: 1,
			price: "0.0000004",
			currency: {
				"@type": "ETH",
			},
			originFees: [{
				account: toUnionAddress("ETHEREUM:"+wallet1Address),
				value: 10,
			}],
			maxFeesBasePoint: 500,
		})

		const nextStock = "1"
		await awaitStock(sdk1, orderId, nextStock)

		const updateAction = await sdk1.order.sellUpdate.prepare({ orderId })
		await updateAction.submit({ price: "0.0000003" })

		await sdk1.apis.order.getOrderById({ id: orderId })

		const fillAction = await sdk2.order.buy.prepare({ orderId })
		expect(fillAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.IGNORED)
		const tx = await fillAction.submit({ amount: 1 })
		expect(tx.transaction.data.endsWith("dead09616c6c64617461")).toEqual(true)
		await tx.wait()

		const nextStock2 = "0"
		await awaitStock(sdk1, orderId, nextStock2)
		// await retry(15, 2000, async () => {
		// 	const order = await sdk1.apis.order.getOrderById({ id: orderId })
		// 	expect(order.status).toEqual("FILLED")
		// })
	})

	test("erc721 bid/acceptBid", async () => {
		const itemId = await mint()

		const bidAction = await sdk2.order.bid.prepare({ itemId: itemId })
		expect(bidAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.IGNORED)
		const orderId = await bidAction.submit({
			amount: 1,
			price: "0.000000002",
			currency: {
				"@type": "ERC20",
				contract: erc20ContractAddress,
			},
		})

		await awaitStock(sdk1, orderId, "0.000000002")

		const updateAction = await sdk2.order.bidUpdate.prepare({ orderId })
		await updateAction.submit({ price: "0.0003" })

		await sdk1.apis.order.getOrderById({ id: orderId })

		const fillAction = await sdk1.order.acceptBid.prepare({ orderId })
		expect(fillAction.maxFeesBasePointSupport).toEqual(MaxFeesBasePointSupport.REQUIRED)
		const tx = await fillAction.submit({ amount: 1, maxFeesBasePoint: 500 })
		await tx.wait()

		const nextStock2 = "0"
		await awaitStock(sdk1, orderId, nextStock2)
		await retry(15, 2000, async () => {
			const order = await sdk1.apis.order.getOrderById({ id: orderId })
			expect(order.status).toEqual("FILLED")
		})
	})

	async function mint(): Promise<ItemId> {
		const wallet1Address = wallet1.getAddressString()
		const action = await sdk1.nft.mint.prepare({
			collectionId: convertEthereumCollectionId(erc721Address, Blockchain.ETHEREUM),
		})
		const result = await action.submit({
			uri: "ipfs://ipfs/QmfVqzkQcKR1vCNqcZkeVVy94684hyLki7QcVzd9rmjuG5",
			creators: [{
				account: convertEthereumToUnionAddress(wallet1Address, Blockchain.ETHEREUM),
				value: 10000,
			}],
			royalties: [],
			lazyMint: false,
			supply: 1,
		})
		if (result.type === MintType.ON_CHAIN) {
			await result.transaction.wait()
		}

		await awaitItem(sdk1, result.itemId)
		return result.itemId
	}

})
