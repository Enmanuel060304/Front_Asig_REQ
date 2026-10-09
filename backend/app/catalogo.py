"""Errores del mantenimiento del catálogo de agencias; los comparten `repo`, `repo_demo` y el router."""


class CatalogoError(Exception):
    """Base: el router la traduce a una respuesta HTTP."""


class ClaveDuplicada(CatalogoError):
    pass


class NoEncontrado(CatalogoError):
    pass
