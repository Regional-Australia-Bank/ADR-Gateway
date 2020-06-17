import flat from "flat"
import _ from "lodash"

const FilterByPaths = (o:object[], condition:(key:any) => boolean) => (<any>flat.unflatten(
    _.fromPairs(
        _.filter(
            _.toPairs(flat.flatten({content:o})),([k]) => condition(k)
        )
    )
)).content

export const RemoveSsaParticulars = (drs:any[]) => FilterByPaths(drs, (k) => !k.includes("ssaParticulars"))

export const DataRecipientStatuses = (drs:any[]) => _.map(_.flatten(_.map(drs, dr => dr.dataRecipientBrands)),brand => ({
    dataRecipientId: brand.dataRecipientBrandId,
    dataRecipientStatus: brand.status
}))

export const DataRecipientProductStatuses = (drs:any[]) => _.map(_.flatten(_.map(_.flatten(_.map(drs, dr => dr.dataRecipientBrands)),brand => brand.softwareProducts)),product => ({
    softwareProductId: product.softwareProductId,
    softwareProductStatus: product.status
}))