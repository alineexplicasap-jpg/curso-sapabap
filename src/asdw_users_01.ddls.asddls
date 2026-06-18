@AbapCatalog.sqlViewName: 'CDS_USERS'
@AbapCatalog.compiler.compareFilter: true
@AbapCatalog.preserveKey: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'CDS ASDW VIEW'
@Metadata.ignorePropagatedAnnotations: true
define view asdw_USERS_01 as select from usr21
  association [1..1] to adrp as _UserAddress
    on $projection.UserAddressId = _UserAddress.persnumber

{
  key bname                         as BusinessName,
      persnumber                    as UserAddressId,
      _UserAddress.name_text        as UserName,
      _UserAddress
}
