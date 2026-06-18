@AbapCatalog.sqlViewName: 'ASDW_COMPOSITE'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'ASDW COMPOSITE'
@Metadata.ignorePropagatedAnnotations: true
define view ASDW_COMP_01 as select from asdw01
association[1..1] to asdw_USERS_01 as _users on $projection.CreatedBy = _UserAddress.businessname
{
    key mandt as Mandt,
    key asdw_id as AsdwId,
    asdw_text as AsdwText,
    resposta as Resposta,
    score as Score,
    created_at as CreatedAt,
    created_by as CreatedBy,
    last_changed_at as LastChangedAt

}

