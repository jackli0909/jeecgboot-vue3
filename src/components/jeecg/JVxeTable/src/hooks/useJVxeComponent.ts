import { computed, nextTick, ref, unref, watch } from 'vue';
import { propTypes } from '/@/utils/propTypes';
import { getEnhanced, replaceProps, vModel } from '../utils/enhancedUtils';
import { JVxeRenderType } from '../types/JVxeTypes';
import { isBoolean, isFunction, isObject, isPromise } from '/@/utils/is';
import { JVxeComponent } from '../types/JVxeComponent';
import { filterDictText } from '/@/utils/dict/JDictSelectUtil';

export function useJVxeCompProps() {
  return {
    // 组件类型
    type: propTypes.string,
    // 渲染类型
    renderType: propTypes.string.def('default'),
    // 渲染参数
    params: propTypes.object,
    // 渲染自定义选项
    renderOptions: propTypes.object,
  };
}

export function useJVxeComponent(props: JVxeComponent.Props) {
  const value = computed(() => props.params.row[props.params.column.property]);
  const innerValue = ref(value.value);
  const row = computed(() => props.params.row);
  const rows = computed(() => props.params.data);
  const column = computed(() => props.params.column);
  // 用户配置的原始 column
  const originColumn = computed(() => column.value.params);
  const rowIndex = computed(() => props.params.$rowIndex);
  const columnIndex = computed(() => props.params.columnIndex);
  // 表格数据长度
  const fullDataLength = computed(() => props.params.$table.internalData.tableFullData.length);
  // 是否正在滚动中
  const scrolling = computed(() => !!props.renderOptions.scrolling);
  const cellProps = computed(() => {
    let renderOptions = props.renderOptions;
    let col = originColumn.value;

    let cellProps = {};

    // 输入占位符
    cellProps['placeholder'] = replaceProps(col, col.placeholder);

    // 解析props
    if (isObject(col.props)) {
      Object.keys(col.props).forEach((key) => {
        cellProps[key] = replaceProps(col, col.props[key]);
      });
    }

    // 判断是否是禁用的列
    cellProps['disabled'] = isBoolean(col['disabled']) ? col['disabled'] : cellProps['disabled'];
    // 判断是否禁用行
    if (renderOptions.isDisabledRow(row.value)) {
      cellProps['disabled'] = true;
    }
    // 判断是否禁用所有组件
    if (renderOptions.disabled === true) {
      cellProps['disabled'] = true;
    }

    return cellProps;
  });

  const listeners = computed(() => {
    let listeners = Object.assign({}, props.renderOptions.listeners || {});
    // 默认change事件
    if (!listeners.change) {
      listeners.change = async (event) => {
        vModel(event.value, row, column);
        await nextTick();
        // 处理 change 事件相关逻辑（例如校验）
        props.params.$table.updateStatus(props.params);
      };
    }
    return listeners;
  });
  const context = {
    innerValue,
    row,
    rows,
    rowIndex,
    column,
    columnIndex,
    originColumn,
    fullDataLength,
    cellProps,
    scrolling,
    handleChangeCommon,
    handleBlurCommon,
  };
  const ctx = { props, context };

  // 获取组件增强
  const enhanced = getEnhanced(props.type);

  watch(
    value,
    (newValue) => {
      // 验证值格式
      let getValue = enhanced.getValue(newValue, ctx);
      if (newValue !== getValue) {
        // 值格式不正确，重新赋值
        newValue = getValue;
        vModel(newValue, row, column);
      }
      innerValue.value = enhanced.setValue(newValue, ctx);
      // 判断是否启用翻译
      if (props.renderType === JVxeRenderType.spaner && enhanced.translate.enabled === true) {
        if (isFunction(enhanced.translate.handler)) {
          let res = enhanced.translate.handler(newValue, ctx);
          // 异步翻译，可解决字典查询慢的问题
          if (isPromise(res)) {
            res.then((v) => (innerValue.value = v));
          } else {
            innerValue.value = res;
          }
        }
      }
    },
    { immediate: true }
  );

  /** 通用处理 change 事件 */
  function handleChangeCommon($value) {
    let getValue = enhanced.getValue($value, ctx);
    trigger('change', { value: getValue });
    // 触发valueChange事件
    parentTrigger('valueChange', {
      type: props.type,
      value: getValue,
      oldValue: value.value,
      col: originColumn.value,
      rowIndex: rowIndex.value,
      columnIndex: columnIndex.value,
    });
  }

  /** 通用处理 blur 事件 */
  function handleBlurCommon(value) {
    trigger('blur', { value });
  }

  /**
   * 如果事件存在的话，就触发
   * @param name 事件名
   * @param event 事件参数
   * @param args 其他附带参数
   */
  function trigger(name, event?, args: any[] = []) {
    let listener = listeners.value[name];
    if (isFunction(listener)) {
      if (isObject(event)) {
        event = packageEvent(name, event);
      }
      listener(event, ...args);
    }
  }

  function parentTrigger(name, event, args: any[] = []) {
    args.unshift(packageEvent(name, event));
    trigger('trigger', name, args);
  }

  function packageEvent(name, event: any = {}) {
    event.row = row.value;
    event.column = column.value;
    // online增强参数兼容
    event.column['key'] = column.value['property'];
    // event.cellTarget = this
    if (!event.type) {
      event.type = name;
    }
    if (!event.cellType) {
      event.cellType = props.type;
    }
    // 是否校验表单，默认为true
    if (isBoolean(event.validate)) {
      event.validate = true;
    }
    return event;
  }

  return {
    ...context,
    enhanced,
    trigger,
  };
}

/**
 * 获取组件默认增强
 */
export function useDefaultEnhanced(): JVxeComponent.EnhancedPartial {
  return {
    installOptions: {
      autofocus: '',
    },
    interceptor: {
      'event.clearActived': () => true,
      'event.clearActived.className': () => true,
    },
    switches: {
      editRender: true,
      visible: false,
    },
    aopEvents: {
      editActived() {},
      editClosed() {},
      activeMethod: () => true,
    },
    translate: {
      enabled: false,
      handler(value, ctx) {
        // 默认翻译方法
        if (ctx) {
          return filterDictText(unref(ctx.context.column).params.options, value);
        } else {
          return value;
        }
      },
    },
    getValue: (value) => value,
    setValue: (value) => value,
    createValue: (defaultValue) => defaultValue,
  } as JVxeComponent.Enhanced;
}
