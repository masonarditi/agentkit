"""Util that calls Twitter API."""

from cdp_agentkit_core.actions.social.twitter.mentions_monitor_start import get_thread
import cdp_agentkit_core.actions.social.twitter.context as context
from pydantic import BaseModel, Field, model_validator
import tweepy
from pydantic import BaseModel, model_validator
import contextvars
import inspect
from collections.abc import Callable
from typing import Any

from langchain_core.utils import get_from_dict_or_env
from pydantic import BaseModel, Field, model_validator
import tweepy

from cdp_agentkit_core.actions.social.twitter.context import TwitterContext, context
from cdp_agentkit_core.actions.social.twitter.mentions_monitor_start import MonitorMentionsThread


class TwitterApiWrapper(BaseModel):
    """Wrapper for Twitter API."""

    #  twitterContext: TwitterContext | None = None
    #  client:tweepy.Client = Field(..., description="twitter client")

    #  ctx:Any = contextvars.ContextVar("ctx", default=None)
    #  ctx:Any | None = None
    #  = ContextVarField(..., description="context var")

    ctx: Any = Field(..., description="context")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.ctx = contextvars.copy_context()

    @model_validator(mode="before")
    @classmethod
    def validate_environment(cls, values: dict) -> Any:
        """Validate that Twitter access token, token secret, and tweepy exists in the environment."""
        api_key = get_from_dict_or_env(values, "twitter_api_key", "TWITTER_API_KEY")
        api_secret = get_from_dict_or_env(values, "twitter_api_secret", "TWITTER_API_SECRET")
        access_token = get_from_dict_or_env(values, "twitter_access_token", "TWITTER_ACCESS_TOKEN")
        access_token_secret = get_from_dict_or_env(values, "twitter_access_token_secret", "TWITTER_ACCESS_TOKEN_SECRET")
        bearer_token = get_from_dict_or_env(values, "twitter_bearer_token", "TWITTER_BEARER_TOKEN")

        client = tweepy.Client(
            bearer_token=bearer_token,
            consumer_key=api_key,
            consumer_secret=api_secret,
            access_token=access_token,
            access_token_secret=access_token_secret,
        )

        ctx = context()
        ctx.client.set(client)

        values["ctx"] = ctx
        values["client"] = client
        values["api_key"] = api_key
        values["api_secret"] = api_secret
        values["access_token"] = access_token
        values["access_token_secret"] = access_token_secret

        return values

    def run_action(self, func: Callable[..., str], **kwargs) -> str:
        """Run a Twitter Action."""

        #  func_signature = inspect.signature(func)
        #  first_kwarg = next(iter(func_signature.parameters.values()), None)

        response = ""

        #  with context.context() as ctx:
        #      print("client")
        #      print(ctx.get_client())

        #  ctx.set_client(self.client)

        #  ctx = contextvars.copy_context()
        #  for var, value in ctx.items():
        #      var.set(value)

        for var, value in self.ctx.items():
            var.set(value)

        print("=== twitter wrapper ===")
        ctx = context()
        print(ctx.client.get())
        #  print(context.get_client())
        #  print(context.get_mentions())
        #  print(context.thread.get())

        #  print(context.unwrap())
        #  print(get_thread())

        #  if context.unwrap() is not None:
        #      print("yay?")
        #      print(context.unwrap().mentions.get())

        response = func(**kwargs)

        #  print("saved?")
        #  if self._ctx is not None:
        #      print(f"self.ctx:{self._ctx['monitor-thread']}")

        print("thread?")
        print(f"ctx.get:{ctx.get('monitor-thread')}")

        self.ctx = contextvars.copy_context()

        #  mt = ctx.get("monitor-thread")
        #  if mt is not None:
        #      print("thread exists")
        #      self.ctx.set("monitor-thread", mt)
        #      #  self._mt = mt
        #  else:
        #      print("thread does not exist")

        response = func(**kwargs)
        self.ctx = contextvars.copy_context()

        return response
