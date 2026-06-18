@AbapCatalog.sqlViewName: 'TABELADOASDW'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'CDS ASDW'
@Metadata.ignorePropagatedAnnotations: true
define view asdw_cd01 as select from asdw01
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
